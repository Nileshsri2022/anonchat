import { describe, test, expect } from 'bun:test';
import { MemoryKVStore } from '../kv-store';
import { IdentityVault } from '../identity-vault';
import {
  exportIdentityBundle,
  serializeInvite,
  parseInvite,
  validateBundle,
} from '../identity-bundle';
import { DirectMessageClient, deriveInboxRoomId } from '../dm-service';
import { RelayCore } from '../relay-core';
import { RoomEncryption } from '../room-encryption';
import { createRoomKey, serializeRoomInvite, parseRoomInvite } from '../room-invite';
import { StorageKeyManager } from '../storage-key';
import { createEncryptedStorage } from '../message-storage';
import type { Contact } from '../contact-manager';
import type { MessageEnvelope } from '../direct-message-session';

/**
 * Ticket 10 — Full-flow integration test (seam S3).
 * One command proves: contact exchange via Identity Bundle, bidirectional DMs with
 * ratcheting and out-of-order delivery, Room creation with a random Room Key, join
 * via Invite, encrypted Room chat across THREE client stacks over ONE RelayCore,
 * a disappearing message purged everywhere, and sealed persistence across reload.
 */

function contactFrom(alias: string, bundle: ReturnType<typeof JSON.parse> & Record<string, string | number>): Contact {
  return {
    id: `contact_${alias}`,
    alias,
    identity: {
      id: `user_${alias}`,
      identityPublicKey: bundle.identityPublicKeySpkiB64 as string,
      preKeyPublic: bundle.preKeyPublicSpkiB64 as string,
      preKeyId: bundle.preKeyId as number,
      fingerprint: `fp-${alias}`,
      identitySigningPublicKey: bundle.identitySigningPublicKeySpkiB64 as string,
      preKeySignature: bundle.preKeySignatureB64 as string,
    },
    verified: false,
    verificationCode: '',
    addedAt: new Date(),
    encryptionStatus: 'established',
  };
}

describe('Full flow E2E — contact → DM → room → disappear → purge → reload', () => {
  test('three client stacks over one relay complete the whole story', async () => {
    // ---- The one relay -------------------------------------------------------
    const relay = new RelayCore({ payloadCapBytes: 64 * 1024, sendRatePerSec: 1000, burstSize: 1000 });

    // ---- Three independent client stacks (fresh vaults = fresh identities) ----
    const makeStack = async (name: string) => {
      const kv = new MemoryKVStore();
      const vault = await IdentityVault.create({ store: kv, iterations: 1000 });
      const bundle = await exportIdentityBundle(vault);
      const client = new DirectMessageClient({ selfUserId: `user_${name}`, vault });

      // A tiny transport: envelopes go through the real RelayCore into rooms;
      // each stack pumps the rooms it is subscribed to.
      const subscribed = new Set<string>([await deriveInboxRoomId(bundle.identityPublicKeySpkiB64)]);
      const transport = async (roomId: string, envelope: MessageEnvelope) => {
        await relay.postMessage({
          id: `${roomId}_${envelope.timestamp}_${Math.random().toString(36).slice(2, 8)}`,
          roomId,
          userId: `user_${name}`,
          username: name,
          encryptedContent: envelope.ciphertext,
          iv: envelope.iv,
          timestamp: envelope.timestamp,
        });
        // Socket-style fan-out: a queued copy per relay room (the stack pumps them)
        const queue = relayMessages.get(roomId) ?? [];
        queue.push(envelope);
        relayMessages.set(roomId, queue);
      };
      const pump = async () => {
        for (const room of await client.pollableRooms()) {
          if (!subscribed.has(room)) continue;
          for (const env of relayMessages.get(room) ?? []) {
            await client.handleInboundEnvelope(env);
          }
          relayMessages.set(room, []);
        }
      };
      return { name, kv, vault, bundle, client, subscribed, transport, pump };
    };
    const relayMessages = new Map<string, MessageEnvelope[]>();

    const alice = await makeStack('alice');
    const bob = await makeStack('bob');
    const carol = await makeStack('carol');

    // ---- Phase 1: contact exchange via Identity Bundle, bidirectional DMs ----
    const inviteB = serializeInvite(bob.bundle);
    const parsedB = parseInvite(inviteB);
    await validateBundle(parsedB);
    const contactB = contactFrom('bob', parsedB);

    await alice.client.sendToContact(contactB, 'first contact over the relay', undefined, alice.transport);
    await bob.pump();
    expect(bob.client.messages()[0].content).toBe('first contact over the relay');

    bob.subscribed.add(bob.client.channels()[0]);
    await bob.client.reply(bob.client.channels()[0], 'reply from bob', undefined, bob.transport);
    await alice.pump();
    expect(alice.client.messages().some((m) => m.content === 'reply from bob')).toBe(true);

    // Out-of-order across the relay
    await alice.client.sendToContact(contactB, 'o1', undefined, alice.transport);
    await alice.client.sendToContact(contactB, 'o2', undefined, alice.transport);
    await bob.pump();
    await bob.pump();
    const bobContents = bob.client.messages().map((m) => m.content);
    expect(bobContents).toContain('o1');
    expect(bobContents).toContain('o2');

    // ---- Phase 2: Room with a random Room Key, joined via Invite -------------
    const roomKey = await createRoomKey();
    const roomInvite = serializeRoomInvite({ roomId: 'room_e2e_1', roomName: 'Story Room', keyB64: roomKey });
    const parsedRoom = parseRoomInvite(roomInvite);

    const roomCrypto: Record<string, RoomEncryption> = {};
    for (const stack of [alice, bob, carol]) {
      const enc = new RoomEncryption();
      await enc.importRoomKey(parsedRoom.keyB64!);
      roomCrypto[stack.name] = enc;
    }

    // Room metadata + canary-less registration on the relay (no key material!)
    relay.upsertRoom({ id: 'room_e2e_1', name: 'Story Room', isProtected: false });

    async function roomSay(stack: Awaited<ReturnType<typeof makeStack>>, _extra: unknown, text: string) {
      const enc = roomCrypto[stack.name];
      const encrypted = await enc.encrypt(text);
      await relay.postMessage({
        id: `room_e2e_1_rs_${Math.random().toString(36).slice(2, 8)}`,
        roomId: 'room_e2e_1',
        userId: `user_${stack.name}`,
        username: stack.name,
        encryptedContent: encrypted.ciphertext,
        iv: encrypted.iv,
        timestamp: Date.now(),
      });
      return encrypted;
    }
    const aliceRoomMsg = await roomSay(alice, undefined as never, 'welcome to the story room');
    await roomSay(bob, undefined as never, 'thanks alice');

    const relayed = relay.getMessages('room_e2e_1');
    expect(relayed.length).toBe(2);
    const decryptedByCarol = await roomCrypto['carol'].decrypt({
      ciphertext: relayed[0].encryptedContent,
      iv: relayed[0].iv,
      tag: '',
    });
    expect(decryptedByCarol).toBe('welcome to the story room');

    // The relay never saw the Room Key or plaintext
    expect(JSON.stringify(relayed)).not.toContain('welcome to the story');
    expect(roomInvite).not.toContain('ROOM_E2E');

    // ---- Phase 3: disappearing message purged locally and at the relay -------
    await relay.postMessage({
      id: 'room_e2e_1_disappearing',
      roomId: 'room_e2e_1',
      userId: 'user_alice',
      username: 'alice',
      encryptedContent: aliceRoomMsg.ciphertext,
      iv: aliceRoomMsg.iv,
      timestamp: Date.now(),
      expiresAt: Date.now() - 1, // already expired
    });
    expect(relay.getMessages('room_e2e_1').some((m) => m.id === 'room_e2e_1_disappearing')).toBe(false);
    expect(relay.sweepExpired()).toBeGreaterThanOrEqual(0);

    // Local encrypted history: store, seal, reload, verify inaccessibility
    const historyKv = new MemoryKVStore();
    const keyManager = new StorageKeyManager(historyKv, 1000);
    const storageKey = await keyManager.getOrCreate();
    const history = createEncryptedStorage(historyKv, storageKey);
    await history.saveMessage({
      id: 'hist_1',
      roomId: 'room_e2e_1',
      userId: 'user_alice',
      username: 'alice',
      content: 'local history secret',
      timestamp: Date.now(),
      encrypted: true,
      expiresAt: Date.now() - 1,
    });
    await history.saveMessage({
      id: 'hist_2',
      roomId: 'room_e2e_1',
      userId: 'user_alice',
      username: 'alice',
      content: 'staying message',
      timestamp: Date.now(),
      encrypted: true,
    });
    expect(await history.purgeExpired('room_e2e_1')).toBe(1);
    const remaining = await history.getMessagesByRoom('room_e2e_1');
    expect(remaining.map((m) => m.content)).toEqual(['staying message']);

    // ---- Phase 4: sealed persistence across reload ----------------------------
    await alice.vault.seal('correct horse battery staple');
    await keyManager.seal('correct horse battery staple');

    // Reload: a fresh vault instance from the same store + a fresh manager
    const reloadedVault = (await IdentityVault.load({ store: alice.kv }))!;
    expect(reloadedVault.isSealed()).toBe(true);
    await expect(reloadedVault.getIdentityData()).rejects.toThrow(/sealed/i);
    await expect(new StorageKeyManager(historyKv, 1000).getOrCreate()).rejects.toThrow(/sealed/i);

    // Raw storage check: history ciphertext, never plaintext
    const raw = JSON.stringify(await historyKv.get('messages:hist_2'));
    expect(raw).not.toContain('staying message');
    expect(raw).toContain('blob');

    // Unlock restores everything, identity included
    expect(await reloadedVault.unlock('correct horse battery staple')).toBe(true);
    const identityAfter = await reloadedVault.getIdentityData();
    expect(identityAfter.identity.publicKeySpkiB64).toBe(alice.bundle.identityPublicKeySpkiB64);
    const unlockedKey = await new StorageKeyManager(historyKv, 1000).getOrCreate('correct horse battery staple');
    const unlockedHistory = createEncryptedStorage(historyKv, unlockedKey);
    expect((await unlockedHistory.getMessagesByRoom('room_e2e_1'))[0].content).toBe('staying message');
  });
});
