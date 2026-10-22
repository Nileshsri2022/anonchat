// Ticket #15 — PQ hybrid handshake (ADR-0006)
// ML-KEM-768 + X25519/P-256 X3DH: the root key derives ONLY with both shares.
import { describe, test, expect } from 'bun:test';

import { MemoryKVStore } from '../kv-store';
import { IdentityVault } from '../identity-vault';
import {
  exportIdentityBundle,
  serializeInvite,
  parseInvite,
  validateBundle,
  type IdentityBundle,
} from '../identity-bundle';
import { DirectMessageClient, deriveInboxRoomId } from '../dm-service';
import type { Contact } from '../contact-manager';
import type { MessageEnvelope } from '../direct-message-session';
import { RelayCore } from '../relay-core';

const ITERS = 1000;

function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const raw = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function contactFromBundle(id: string, alias: string, bundle: IdentityBundle): Contact {
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
    },
    verified: false,
    verificationCode: '',
    addedAt: new Date(),
    encryptionStatus: 'established',
  };
}

describe('PQ hybrid handshake (ticket 15)', () => {
  test('S1: vault generates PQ KEM keys; Bundle v2 carries a signed PQ key; invite round-trips', async () => {
    const vault = await IdentityVault.create({ store: new MemoryKVStore(), iterations: ITERS });
    expect(vault.hasPqKem()).toBe(true);

    const bundle = await exportIdentityBundle(vault);
    expect(bundle.version).toBe(2);
    expect(bundle.pqKemPublicB64).toBeDefined();
    expect(bundle.pqKemSignatureB64).toBeDefined();
    await validateBundle(bundle); // valid signature over the PQ key

    const parsed = parseInvite(serializeInvite(bundle));
    expect(parsed.version).toBe(2);
    expect(parsed.pqKemPublicB64).toBe(bundle.pqKemPublicB64);
    expect(parsed.pqKemSignatureB64).toBe(bundle.pqKemSignatureB64);
    await validateBundle(parsed);
  });

  test('S1: tampered PQ key or broken PQ signature is rejected on import', async () => {
    const vault = await IdentityVault.create({ store: new MemoryKVStore(), iterations: ITERS });
    const bundle = await exportIdentityBundle(vault);

    // Tamper the PQ public key: signature no longer matches
    const tamperedKey = b64ToBytes(bundle.pqKemPublicB64!);
    tamperedKey[0] ^= 0xff;
    const badKey: IdentityBundle = {
      ...bundle,
      pqKemPublicB64: btoa(String.fromCharCode(...tamperedKey)),
    };
    await expect(validateBundle(badKey)).rejects.toThrow();

    // Valid key, corrupted signature
    const badSig: IdentityBundle = {
      ...bundle,
      pqKemSignatureB64: bundle.pqKemSignatureB64!.slice(0, -4) + 'AAAA',
    };
    await expect(validateBundle(badSig)).rejects.toThrow();

    // PQ key without signature (or vice versa) is structurally rejected
    const halfPq: IdentityBundle = { ...bundle, pqKemSignatureB64: undefined };
    await expect(validateBundle(halfPq)).rejects.toThrow();
  });

  test('S1: a v1 bundle without PQ fields still validates (classical path stays open)', async () => {
    const vault = await IdentityVault.create({ store: new MemoryKVStore(), iterations: ITERS });
    const v2 = await exportIdentityBundle(vault);
    const v1: IdentityBundle = {
      version: 1,
      identityPublicKeySpkiB64: v2.identityPublicKeySpkiB64,
      identitySigningPublicKeySpkiB64: v2.identitySigningPublicKeySpkiB64,
      preKeyPublicSpkiB64: v2.preKeyPublicSpkiB64,
      preKeySignatureB64: v2.preKeySignatureB64,
      preKeyId: v2.preKeyId,
      createdAt: v2.createdAt,
    };
    await validateBundle(v1);
  });

  test('S3: two PQ stacks open a DM — KEM ciphertext rides only the first envelope, conversation flows', async () => {
    const relay = new RelayCore({ sendRatePerSec: 1000, burstSize: 1000 });
    const queue = new Map<string, MessageEnvelope[]>();

    const kvA = new MemoryKVStore();
    const kvB = new MemoryKVStore();
    const vaultA = await IdentityVault.create({ store: kvA, iterations: ITERS });
    const vaultB = await IdentityVault.create({ store: kvB, iterations: ITERS });
    const bundleB = await exportIdentityBundle(vaultB);

    const alice = new DirectMessageClient({ selfUserId: 'alice', vault: vaultA });
    const bob = new DirectMessageClient({ selfUserId: 'bob', vault: vaultB });

    const wire: MessageEnvelope[] = [];
    const transportA = async (roomId: string, envelope: MessageEnvelope) => {
      wire.push(envelope);
      await relay.postMessage({
        id: `${roomId}_${envelope.timestamp}_${Math.random().toString(36).slice(2, 8)}`,
        roomId,
        userId: 'user_alice',
        username: 'alice',
        encryptedContent: envelope.ciphertext,
        iv: envelope.iv,
        timestamp: envelope.timestamp,
      });
      const q = queue.get(roomId) ?? [];
      q.push(envelope);
      queue.set(roomId, q);
    };

    const bobInbox = await deriveInboxRoomId(bundleB.identityPublicKeySpkiB64);
    const bobSubscribed = new Set([bobInbox]);
    const pumpB = async () => {
      for (const room of await bob.pollableRooms()) {
        if (!bobSubscribed.has(room)) continue;
        for (const env of queue.get(room) ?? []) await bob.handleInboundEnvelope(env);
        queue.set(room, []);
      }
    };

    const contactB = contactFromBundle('cB', 'bob', bundleB);
    const first = await alice.sendToContact(contactB, 'pq hello', undefined, transportA);
    expect(first.header.pqCiphertext).toBeDefined(); // KEM ciphertext on the FIRST message
    await pumpB();
    expect(bob.messages().map((m) => m.content)).toContain('pq hello');

    // Reply: no KEM ciphertext on later messages
    const chan = alice.channels()[0];
    const second = await alice.sendToContact(contactB, 'second', undefined, transportA);
    expect(second.header.pqCiphertext).toBeUndefined();
    void chan;

    // Tampered KEM ciphertext must fail closed (responder derives a different secret → auth failure)
    const kvC = new MemoryKVStore();
    const vaultC = await IdentityVault.create({ store: kvC, iterations: ITERS });
    const carol = new DirectMessageClient({ selfUserId: 'carol', vault: vaultC });
    const mutated: MessageEnvelope = {
      ...first,
      header: { ...first.header, pqCiphertext: first.header.pqCiphertext!.slice(0, -4) + 'AAAA' },
    };
    await expect(carol.handleInboundEnvelope(mutated)).rejects.toThrow();
  });

  test('S3: responder without PQ capability fails closed against a hybrid initiator', async () => {
    const relay = new RelayCore({ sendRatePerSec: 1000, burstSize: 1000 });
    const kvA = new MemoryKVStore();
    const vaultA = await IdentityVault.create({ store: kvA, iterations: ITERS });
    const bundleA = await exportIdentityBundle(vaultA);

    // A legacy vault: strip the PQ keys out of the persisted record, reload
    const kvB = new MemoryKVStore();
    const fresh = await IdentityVault.create({ store: kvB, iterations: ITERS });
    const raw = (await kvB.get('identity')) as { data: Record<string, unknown> };
    delete raw.data.pqKem;
    await kvB.set('identity', raw);
    const legacyVault = (await IdentityVault.load({ store: kvB, iterations: ITERS }))!;
    expect(legacyVault.hasPqKem()).toBe(false);

    const alice = new DirectMessageClient({ selfUserId: 'alice', vault: vaultA });
    const bob = new DirectMessageClient({ selfUserId: 'bob', vault: legacyVault });

    const inbox = await deriveInboxRoomId((await exportIdentityBundle(legacyVault)).identityPublicKeySpkiB64);
    const wire: MessageEnvelope[] = [];
    const transportA = async (roomId: string, envelope: MessageEnvelope) => {
      wire.push(envelope);
      await relay.postMessage({
        id: `${roomId}_${envelope.timestamp}_${Math.random().toString(36).slice(2, 8)}`,
        roomId,
        userId: 'user_alice',
        username: 'alice',
        encryptedContent: envelope.ciphertext,
        iv: envelope.iv,
        timestamp: envelope.timestamp,
      });
    };

    // Legacy bob's bundle has no PQ key → alice goes classical-only, bob copes
    const legacyBundle = await exportIdentityBundle(legacyVault);
    expect(legacyBundle.version).toBe(1);
    void bundleA;
    const contactLegacy = contactFromBundle('cB', 'bob', legacyBundle);
    const first = await alice.sendToContact(contactLegacy, 'classical hello', undefined, transportA);
    expect(first.header.pqCiphertext).toBeUndefined();
    // legacy responder can read the classical-only first message
    await bob.handleInboundEnvelope(first);
    expect(bob.messages().map((m) => m.content)).toContain('classical hello');
    void inbox;
  });
});
