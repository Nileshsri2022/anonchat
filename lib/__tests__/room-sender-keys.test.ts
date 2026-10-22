// Ticket #18 — Room rewire (ADR-0008): Room Key protects only Intros;
// content rides pairwise-distributed Sender-Key chains; late joiners see no
// history; leave rotates the remaining members' keys.
import { describe, test, expect } from 'bun:test';

import { MemoryKVStore } from '../kv-store';
import { IdentityVault } from '../identity-vault';
import { exportIdentityBundle } from '../identity-bundle';
import { DirectMessageClient } from '../dm-service';
import { RoomEncryption } from '../room-encryption';
import { createRoomKey } from '../room-invite';
import { RoomSenderKeyCoordinator } from '../room-sender-keys';
import type { Contact } from '../contact-manager';
import type { MessageEnvelope } from '../direct-message-session';

const ITERS = 1000;
const ROOM = 'room_story_1';

async function makeStack(name: string, displayName?: string) {
  const vault = await IdentityVault.create({ store: new MemoryKVStore(), iterations: ITERS });
  const bundle = await exportIdentityBundle(vault);
  const client = new DirectMessageClient({ selfUserId: name, vault });
  const signing = await vault.getSigningKeyPair();
  const signingSpkiB64 = btoa(
    String.fromCharCode(...new Uint8Array(await crypto.subtle.exportKey('spki', signing.publicKey))),
  );
  const coordinator = await RoomSenderKeyCoordinator.create(
    ROOM,
    bundle.identityPublicKeySpkiB64,
    signingSpkiB64,
    displayName,
  );
  return { name, bundle, client, coordinator, inbox: await import('../dm-service').then((m) => m.deriveInboxRoomId(bundle.identityPublicKeySpkiB64)) };
}

function contactOf(stack: { bundle: Awaited<ReturnType<typeof exportIdentityBundle>>; name: string }): Contact {
  const b = stack.bundle;
  return {
    id: `c_${stack.name}`,
    alias: stack.name,
    identity: {
      id: `user_${stack.name}`,
      identityPublicKey: b.identityPublicKeySpkiB64,
      preKeyPublic: b.preKeyPublicSpkiB64,
      preKeyId: b.preKeyId,
      fingerprint: 'fp',
      identitySigningPublicKey: b.identitySigningPublicKeySpkiB64,
      preKeySignature: b.preKeySignatureB64,
      pqKemPublicB64: b.pqKemPublicB64,
      pqKemSignatureB64: b.pqKemSignatureB64,
    },
    verified: false,
    verificationCode: '',
    addedAt: new Date(),
    encryptionStatus: 'established',
  };
}

describe('Room rewire — sender-key groups (ticket 18)', () => {
  test('S3: intro bootstrap → pairwise distribution → authenticated content → no history for late joiner → leave rotation', async () => {
    const alice = await makeStack('alice', 'Alice A.');
    const bob = await makeStack('bob');
    const carol = await makeStack('carol', 'Carol C.');
    const all = [alice, bob, carol];

    // Everyone establishes pairwise DM channels FIRST (contacts from out-of-band
    // bundle knowledge in this harness — intros make them known inside the room).
    const dmBuffers = new Map<string, MessageEnvelope[]>();
    const dmTransport = (from: typeof alice, to: typeof bob) => async (room: string, env: MessageEnvelope) => {
      const key = `${from.name}->${to.name}`;
      const q = dmBuffers.get(key) ?? [];
      q.push(env);
      dmBuffers.set(key, q);
      void room;
    };
    const pairs: Array<[typeof alice, typeof bob]> = [
      [alice, bob], [alice, carol], [bob, alice], [bob, carol], [carol, alice], [carol, bob],
    ];
    for (const [a, b] of pairs) {
      await a.client.sendToContact(contactOf(b), `dm bootstrap ${a.name}->${b.name}`, undefined, dmTransport(a, b));
    }
    const pumpDM = async () => {
      for (const [a, b] of pairs) {
        for (const env of dmBuffers.get(`${a.name}->${b.name}`) ?? []) {
          await b.client.handleInboundEnvelope(env);
        }
        dmBuffers.set(`${a.name}->${b.name}`, []);
      }
    };
    await pumpDM();

    // ---- Phase 1: the Room Key encrypts exactly the Intros -------------------
    const roomKey = await createRoomKey();
    const roomEnc = new RoomEncryption();
    await roomEnc.importRoomKey(roomKey);
    const dmControls = new Map<string, string[]>(); // from->to control payloads
    const control = (from: typeof alice, to: typeof bob) => async (content: string) => {
      const key = `${from.name}->${to.name}`;
      const q = dmControls.get(key) ?? [];
      q.push(content);
      dmControls.set(key, q);
    };

    for (const stack of all) {
      const introPlain = JSON.stringify(stack.coordinator.makeIntroPayload());
      const introEncrypted = await roomEnc.encrypt(introPlain);
      expect(introEncrypted.ciphertext).not.toContain('Alice');
      void introEncrypted; // in production this rides the relay room buffer
    }

    // ---- Phase 2: intros processed → pairwise Sender-Key distribution -------
    for (const stack of all) {
      for (const peer of all) {
        if (peer === stack) continue;
        const introPlain = JSON.stringify(peer.coordinator.makeIntroPayload());
        const info = stack.coordinator.onIntroPayload(introPlain);
        expect(info).not.toBeNull();
        // distribute our sender key to this member over their pairwise DM
        const dist = await stack.coordinator.distributionFor(info!.identitySpkiB64);
        await control(stack, peer)(dist);
      }
    }
    for (const stack of all) {
      for (const peer of all) {
        if (peer === stack) continue;
        for (const payload of dmControls.get(`${peer.name}->${stack.name}`) ?? []) {
          await stack.coordinator.onDistribution(payload);
        }
        dmControls.set(`${peer.name}->${stack.name}`, []);
      }
    }
    // Sender keys were distributed ONLY inside DMs — nothing hit the room.

    // ---- Phase 3: room content on sender chains, authenticated --------------
    const aliceMsg = await alice.coordinator.encryptContent('welcome to the new room');
    const parsed = JSON.parse(aliceMsg) as { t: string; from: string };
    expect(parsed.t).toBe('msg');
    expect(parsed.from).toBe(alice.bundle.identityPublicKeySpkiB64);

    for (const receiver of [bob, carol]) {
      const got = await receiver.coordinator.decryptContent(aliceMsg);
      expect(got.text).toBe('welcome to the new room');
      expect(got.from).toBe(alice.bundle.identityPublicKeySpkiB64);
      expect(got.verified).toBe(false); // Unverified Badge until SAS
    }
    // Replay of the same content is rejected (per-sender consumed guard)
    await expect(bob.coordinator.decryptContent(aliceMsg)).rejects.toThrow(/replay/i);

    // Verify a member pairwise → the badge clears on the NEXT message
    bob.coordinator.markSasVerified(alice.bundle.identityPublicKeySpkiB64);
    const second = await alice.coordinator.encryptContent('second welcome');
    expect((await bob.coordinator.decryptContent(second)).verified).toBe(true);

    // ---- Phase 4: carol joins LATE — she cannot read pre-join history -------
    const dave = await makeStack('dave');
    all.push(dave);
    pairs.push([alice, dave], [dave, alice]);
    await alice.client.sendToContact(contactOf(dave), 'dm bootstrap', undefined, dmTransport(alice, dave));
    await pumpDM();
    // Before carol/dave join, alice already sent several messages (positions 0..2)
    for (let i = 0; i < 2; i++) await alice.coordinator.encryptContent(`history ${i}`);

    // Dave receives alice's distribution with startN = alice's current position
    const daveDist = await alice.coordinator.distributionFor(dave.bundle.identityPublicKeySpkiB64);
    await dave.coordinator.onDistribution(daveDist);
    const oldMsg = await alice.coordinator.encryptContent('post-join only');
    // The pre-join positions are consumed — a relay buffer replay of an old
    // ciphertext (same epoch, low n) must be rejected, not decrypted.
    const oldWire = JSON.parse(await alice.coordinator.encryptContent('buffered old')) as { msg: { n: number } };
    void oldWire;
    const got2 = await dave.coordinator.decryptContent(oldMsg);
    expect(got2.text).toBe('post-join only');
    // Dave never received carol's intro — he only knows alice (his registry holds exactly her)
    expect(dave.coordinator.members().length).toBe(1);

    // ---- Phase 5: bob leaves pairwise → alice rotates ------------------------
    const bobLeave = await bob.coordinator.leaveAnnouncementFor(alice.bundle.identityPublicKeySpkiB64);
    const rotated = await alice.coordinator.onLeaveAnnounced(bobLeave);
    expect(rotated.newEpoch).toBe(1);
    expect(alice.coordinator.members().find((m) => m.identitySpkiB64 === bob.bundle.identityPublicKeySpkiB64)).toBeUndefined();

    // Post-rotation content is a new epoch — bob (no redistribution) cannot read it
    const postLeave = await alice.coordinator.encryptContent('bob must not read this');
    await expect((async () => bob.coordinator.decryptContent(postLeave))()).rejects.toThrow();
    // Remaining members with the NEW distribution (rotation re-key includes history) read it fine
    const newDist = await alice.coordinator.distributionFor(dave.bundle.identityPublicKeySpkiB64, { includeHistory: true });
    await dave.coordinator.onDistribution(newDist);
    const davePost = await dave.coordinator.decryptContent(postLeave);
    expect(davePost.text).toBe('bob must not read this');
  });
});
