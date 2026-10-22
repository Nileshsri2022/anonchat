// Ticket #17 — Sender-Key chains with pairwise distribution (ADR-0008)
// Per-(member, room) forward-secure sending; seeds travel only over DM ratchets.
import { describe, test, expect } from 'bun:test';

import { MemoryKVStore } from '../kv-store';
import { IdentityVault } from '../identity-vault';
import { exportIdentityBundle } from '../identity-bundle';
import { DirectMessageClient } from '../dm-service';
import { SenderKeyRatchet, createSenderKey } from '../sender-key';
import type { Contact } from '../contact-manager';
import type { MessageEnvelope } from '../direct-message-session';

const ITERS = 1000;
const ROOM = 'room_senderkey_test';

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

async function makeStack(name: string) {
  const vault = await IdentityVault.create({ store: new MemoryKVStore(), iterations: ITERS });
  const bundle = await exportIdentityBundle(vault);
  return { name, vault, bundle, client: new DirectMessageClient({ selfUserId: name, vault }) };
}

const CTX = (senderIdentity: string) => `${ROOM}|${senderIdentity}`;

describe('Sender-Key lib (ticket 17)', () => {
  test('S1: create + ratchet properties — unique message keys, out-of-order, consumed guard', async () => {
    const { seedB64, ratchet } = await createSenderKey();
    const ctx = CTX('sender-identity-spki');
    const m1 = await ratchet.encrypt('first', ctx);
    const m2 = await ratchet.encrypt('second', ctx);
    const m3 = await ratchet.encrypt('third', ctx);
    expect(m1.n).toBe(0);
    expect(m2.n).toBe(1);
    expect(m3.ciphertext).not.toBe(m2.ciphertext);

    const remote = await SenderKeyRatchet.forRemote(seedB64, 0);
    // Out of order: third arrives first, then first — the skip cache fills in
    expect(await remote.decrypt(m3, ctx)).toBe('third');
    expect(await remote.decrypt(m1, ctx)).toBe('first');
    expect(await remote.decrypt(m2, ctx)).toBe('second');

    // Consumed messages never decrypt twice (replay guard)
    await expect(remote.decrypt(m2, ctx)).rejects.toThrow(/replay/i);

    // AAD binding: a message moved to another room/sender context fails
    await expect(remote.decrypt(m1, CTX('other-context'))).rejects.toThrow();
  });

  test('S1: rotation produces a fresh epoch; old-seed receivers cannot read new messages', async () => {
    const first = await createSenderKey();
    const rotated = await first.ratchet.rotate();
    expect(rotated.epoch).toBe(1);
    expect(first.ratchet.currentEpoch()).toBe(1);
    const fresh = await SenderKeyRatchet.forRemote(first.seedB64, 0);
    const newMsg = await first.ratchet.encrypt('after rotation', CTX('s'));
    expect(newMsg.epoch).toBe(1);
    await expect(fresh.decrypt(newMsg, CTX('s'))).rejects.toThrow();
  });

  test('S3: the seed distributes strictly pairwise over the DM ratchet; only seeded members decrypt', async () => {
    const alice = await makeStack('alice');
    const bob = await makeStack('bob');
    const carol = await makeStack('carol');

    // Alice ↔ Bob DM (PQ, sealed v3)
    const dmWire: MessageEnvelope[] = [];
    const dmTransport = async (_room: string, env: MessageEnvelope) => dmWire.push(env);
    await alice.client.sendToContact(contactFromBundle('cB', 'bob', bob.bundle), 'hello', undefined, async (room, env) => {
      dmWire.push(env);
      void room;
    });
    for (const env of [...dmWire]) await bob.client.handleInboundEnvelope(env);
    dmWire.length = 0;

    // Alice creates a Sender Key for the room and distributes it pairwise —
    // the seed rides INSIDE a DM ratchet envelope, never in the room.
    const created = await createSenderKey();
    const distribution = JSON.stringify({ t: 'sk', roomId: ROOM, epoch: 0, seed: created.seedB64 });
    await alice.client.sendToContact(contactFromBundle('cB', 'bob', bob.bundle), distribution, undefined, async (room, env) => {
      dmWire.push(env);
      void room;
    });
    const dmEnvelopes = [...dmWire];
    dmWire.length = 0;
    let bobSawDistribution = '';
    for (const env of dmEnvelopes) {
      const d = await bob.client.handleInboundEnvelope(env);
      if (d?.content.startsWith('{"t":"sk"')) bobSawDistribution = d.content;
    }
    expect(bobSawDistribution).toBeTruthy();
    const bobSeed = (JSON.parse(bobSawDistribution) as { seed: string }).seed;
    const bobRemote = await SenderKeyRatchet.forRemote(bobSeed, 0);

    // Room traffic: alice's sender chain; bob decrypts
    const aliceIdentity = alice.bundle.identityPublicKeySpkiB64;
    const roomMsg = await created.ratchet.encrypt('room secret', CTX(aliceIdentity));
    expect(roomMsg.ciphertext).not.toContain('room secret');
    expect(await bobRemote.decrypt(roomMsg, CTX(aliceIdentity))).toBe('room secret');

    // Carol never received the pairwise distribution — without the seed she cannot read
    const wrong = await createSenderKey();
    const carolRemote = await SenderKeyRatchet.forRemote(wrong.seedB64, 0);
    await expect(carolRemote.decrypt(roomMsg, CTX(aliceIdentity))).rejects.toThrow();
  });
});
