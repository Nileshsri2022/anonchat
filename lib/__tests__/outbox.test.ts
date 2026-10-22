import { RelayCore } from '../relay-core';

// Ticket #24 — Encrypted Outbox (ADR-0010): messages composed offline are
// sealed, queued, flushed on reconnect with retry; nothing silently dropped.
import { describe, test, expect } from 'bun:test';

import { IdentityVault } from '../identity-vault';
import { exportIdentityBundle } from '../identity-bundle';
import { DirectMessageClient, deriveInboxRoomId } from '../dm-service';
import { Outbox, OUTBOX_RECORD_KEY, type OutboxItem } from '../outbox';
import { StorageKeyManager } from '../storage-key';
import { MemoryKVStore as Store, MemoryKVStore } from '../kv-store';
import type { Contact } from '../contact-manager';
import type { MessageEnvelope } from '../direct-message-session';

const ITERS = 1000;
const PASSPHRASE = 'outbox-passphrase';

function contactFromBundle(id: string, alias: string, bundle: Awaited<ReturnType<typeof exportIdentityBundle>>): Contact {
  return {
    id,
    alias,
    identity: {
      id: `user_${alias}`,
      identityPublicKey: bundle.identityPublicKeySpkiB64,
      preKeyPublic: bundle.preKeyPublicSpkiB64,
      preKeyId: bundle.preKeyId,
      fingerprint: 'fp',
      identitySigningPublicKey: bundle.identitySigningPublicKeySpkiB64,
      preKeySignature: bundle.preKeySignatureB64,
      pqKemPublicB64: bundle.pqKemPublicB64,
      pqKemSignatureB64: bundle.pqKemSignatureB64,
    },
    verified: false,
    verificationCode: '',
    addedAt: new Date(),
    encryptionStatus: 'established',
  };
}

describe('Encrypted Outbox (ticket 24)', () => {
  test('S1: flush success removes items; failure marks them for retry', async () => {
    const store = new Store();
    const key = await new StorageKeyManager(store).getOrCreate(PASSPHRASE);
    const outbox = new Outbox(store, key);

    let failures = 2;
    const sent: OutboxItem[] = [];
    const flakyTransport = async (roomId: string, _envelope: unknown, item: OutboxItem) => {
      if (failures > 0) {
        failures -= 1;
        throw new Error('network down');
      }
      sent.push(item);
      void roomId;
      void _envelope;
    };

    await outbox.enqueue({ channelId: 'ch1', content: 'offline one' });
    await outbox.enqueue({ channelId: 'ch1', content: 'offline two' });
    expect(outbox.count()).toBe(2);

    const r1 = await outbox.flush(flakyTransport);
    expect(r1.sent).toBe(0);
    expect(r1.failed).toBe(2);
    expect(outbox.count()).toBe(2);
    expect(outbox.items().every((i) => i.state === 'failed')).toBe(true);

    const r2 = await outbox.flush(flakyTransport);
    expect(r2.sent).toBe(2);
    expect(r2.failed).toBe(0);
    expect(outbox.count()).toBe(0);
    expect(sent.map((i) => i.content)).toEqual(['offline one', 'offline two']); // in order
  });

  test('S1: the queue is sealed at rest — raw store reads expose nothing', async () => {
    const raw = new Store();
    const manager = new StorageKeyManager(raw);
    const key = await manager.getOrCreate(PASSPHRASE);
    const outbox = new Outbox(raw, key);
    await outbox.enqueue({ channelId: 'ch9', content: 'secret while offline' });

    // Reload from the same raw store with the same key: queue restores
    const reloaded = new Outbox(raw, await manager.getOrCreate());
    await reloaded.load();
    expect(reloaded.count()).toBe(1);
    expect(reloaded.items()[0].content).toBe('secret while offline');

    // The raw record is ciphertext: no plaintext in the persisted bytes
    const rawRecord = JSON.stringify(await raw.get(OUTBOX_RECORD_KEY));
    expect(rawRecord).not.toContain('secret while offline');
    expect(rawRecord.length).toBeGreaterThan(0);
  });

  test('S3: offline enqueue → reconnect flush → the peer receives, in order', async () => {
    const relay = new RelayCore();
    const aliceVault = await IdentityVault.create({ store: new MemoryKVStore(), iterations: ITERS });
    const bobVault = await IdentityVault.create({ store: new MemoryKVStore(), iterations: ITERS });
    const alice = new DirectMessageClient({ selfUserId: 'alice', vault: aliceVault });
    const bob = new DirectMessageClient({ selfUserId: 'bob', vault: bobVault });
    const contactB = contactFromBundle('cB', 'bob', await exportIdentityBundle(bobVault));

    const wire: MessageEnvelope[] = [];
    let networkUp = false;
    const transport = async (room: string, env: MessageEnvelope) => {
      if (!networkUp) throw new Error('offline');
      wire.push(env);
      await relay.postMessage({
        id: `${room}_${env.timestamp}_${Math.random().toString(36).slice(2, 6)}`,
        roomId: room,
        userId: 'user_alice',
        username: 'alice',
        encryptedContent: env.ciphertext,
        iv: env.iv,
        timestamp: env.timestamp,
      });
      void room;
    };

    // Session established while online
    let down = false;
    const tryTransport = async (room: string, env: MessageEnvelope) => {
      try {
        await transport(room, env);
      } catch (e) {
        down = true;
        throw e;
      }
    };
    try {
      await alice.sendToContact(contactB, 'first (online)', undefined, tryTransport);
    } catch {
      // session opened; send failed → outbox
    }
    void down;

    // Network dies: two messages composed offline go to the outbox
    const outbox = new Outbox(new Store(), await new StorageKeyManager(new Store()).getOrCreate(PASSPHRASE));
    for (const content of ['offline A', 'offline B']) {
      try {
        await alice.sendToContact(contactB, content, undefined, transport);
      } catch {
        // the outbox holds the CONVERSATION (contact), not the ephemeral channel:
        // a failed first send discards the session, so flush re-initiates
        await outbox.enqueue({ channelId: contactB.identity.identityPublicKey, content });
      }
    }
    expect(outbox.count()).toBe(2);

    // Reconnect: flush through the live client (re-initiating as needed)
    networkUp = true;
    await outbox.flush(async (_room, _env, item) => {
      await alice.sendToContact(contactB, item.content, undefined, transport);
    });
    // deliver everything to bob
    
    for (const env of wire) {
      await bob.handleInboundEnvelope(env).catch(() => null);
    }
    const contents = bob.messages().map((m) => m.content);
    expect(contents.indexOf('offline A')).toBeGreaterThanOrEqual(0);
    expect(contents.indexOf('offline B')).toBe(contents.indexOf('offline A') + 1); // in order
  });
});

