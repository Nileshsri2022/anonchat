import { describe, test, expect } from 'bun:test';
import { MemoryKVStore } from '../kv-store';
import { IdentityVault } from '../identity-vault';
import { exportIdentityBundle } from '../identity-bundle';
import { DirectMessageClient, deriveInboxRoomId } from '../dm-service';
import type { Contact } from '../contact-manager';
import type { MessageEnvelope } from '../direct-message-session';

async function makeClient(selfUserId: string) {
  const vault = await IdentityVault.create({ store: new MemoryKVStore(), iterations: 1000 });
  const bundle = await exportIdentityBundle(vault);
  const client = new DirectMessageClient({ selfUserId, vault });
  return { vault, bundle, client };
}

function contactFromBundle(alias: string, bundle: Awaited<ReturnType<typeof exportIdentityBundle>>): Contact {
  return {
    id: `contact_${alias}`,
    alias,
    identity: {
      id: `user_${alias}`,
      identityPublicKey: bundle.identityPublicKeySpkiB64,
      preKeyPublic: bundle.preKeyPublicSpkiB64,
      preKeyId: bundle.preKeyId,
      fingerprint: 'fp-' + alias,
      identitySigningPublicKey: bundle.identitySigningPublicKeySpkiB64,
      preKeySignature: bundle.preKeySignatureB64,
    },
    verified: false,
    verificationCode: '',
    addedAt: new Date(),
    encryptionStatus: 'established',
  };
}

describe('DirectMessageClient — Ticket 04: two-client flow over a transport', () => {
  test('A initiates from B\u2019s bundle; B completes as Responder on the inbound envelope; both converse', async () => {
    const a = await makeClient('user_alice');
    const b = await makeClient('user_bob');

    // The deterministic inbox B listens on equals what A derives from B's bundle
    const inboxB = await deriveInboxRoomId(b.bundle.identityPublicKeySpkiB64);
    const inboxBFromA = await deriveInboxRoomId(b.bundle.identityPublicKeySpkiB64);
    expect(inboxB).toBe(inboxBFromA);

    // Rooms B is subscribed to: its inbox (plus channels it learns)
    const bRooms = new Set<string>([inboxB]);
    const aRooms = new Set<string>([await deriveInboxRoomId(a.bundle.identityPublicKeySpkiB64)]);

    // Transport: relay rooms — an envelope reaches a client only if it subscribed
    const relay = new Map<string, MessageEnvelope[]>();
    async function deliver(roomId: string, envelope: MessageEnvelope, subscriberRooms: Set<string>) {
      if (!subscriberRooms.has(roomId)) return; // nobody listening on that room
      (relay.get(roomId) ?? relay.set(roomId, []).get(roomId)!).push(envelope);
    }
    async function pumpInbox(client: DirectMessageClient, rooms: Set<string>) {
      for (const room of await client.pollableRooms()) {
        for (const env of relay.get(room) ?? []) {
          if (rooms.has(room)) await client.handleInboundEnvelope(env);
        }
        relay.set(room, []);
      }
    }

    const contactB = contactFromBundle('bob', b.bundle);

    // A sends the first message — delivered to the Pairwise Channel and to B's inbox
    await a.client.sendToContact(contactB, 'hello Bob', undefined, async (roomId, envelope) => {
      await deliver(roomId, envelope, bRooms);
    });
    await pumpInbox(b.client, bRooms);

    // B decrypts via the Responder path without having added A first
    const bMessages = b.client.messages();
    expect(bMessages.length).toBe(1);
    expect(bMessages[0].content).toBe('hello Bob');
    expect(bMessages[0].channelId).toBe(a.client.channels()[0]);

    // B subscribes to the learned channel and replies
    for (const ch of b.client.channels()) bRooms.add(ch);
    await b.client.reply(bMessages[0].channelId, 'hi Alice', undefined, async (roomId, envelope) => {
      await deliver(roomId, envelope, aRooms);
    });

    // B's reply goes to the channel — A is subscribed to it once A knows it
    for (const ch of b.client.channels()) aRooms.add(ch);
    await pumpInbox(a.client, aRooms);

    const aMessages = a.client.messages();
    expect(aMessages.some((m) => m.content === 'hi Alice')).toBe(true);
  });

  test('out-of-order envelopes sent while the recipient was away decrypt on catch-up', async () => {
    const a = await makeClient('user_alice');
    const b = await makeClient('user_bob');
    const contactB = contactFromBundle('bob', b.bundle);

    const inboxB = await deriveInboxRoomId(b.bundle.identityPublicKeySpkiB64);
    const buffer: Array<{ room: string; env: MessageEnvelope }> = [];

    await a.client.sendToContact(contactB, 'first', undefined, async (roomId, envelope) => {
      buffer.push({ room: roomId, env: envelope });
    });
    await a.client.sendToContact(contactB, 'second', undefined, async (roomId, envelope) => {
      buffer.push({ room: roomId, env: envelope });
    });
    await a.client.sendToContact(contactB, 'third', undefined, async (roomId, envelope) => {
      buffer.push({ room: roomId, env: envelope });
    });

    // B comes online and drains only its inbox, out of order
    const inboxEnvs = buffer.filter((m) => m.room === inboxB).map((m) => m.env);
    expect(inboxEnvs.length).toBe(3);
    for (const env of [inboxEnvs[2], inboxEnvs[0], inboxEnvs[1]]) {
      await b.client.handleInboundEnvelope(env);
    }
    const contents = b.client.messages().map((m) => m.content).sort();
    expect(contents).toEqual(['first', 'second', 'third']);
  });
});
