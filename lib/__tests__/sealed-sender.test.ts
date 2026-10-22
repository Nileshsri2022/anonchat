// Ticket #16 — Sealed sender, Envelope v3 (ADR-0007)
// No sender identity on the wire; the recipient authenticates the sender
// from inside the ciphertext; the relay stores nothing attributable.
import { describe, test, expect } from 'bun:test';

import { MemoryKVStore } from '../kv-store';
import { IdentityVault } from '../identity-vault';
import { exportIdentityBundle } from '../identity-bundle';
import { DirectMessageClient, deriveInboxRoomId } from '../dm-service';
import { DirectMessageSession } from '../direct-message-session';
import type { Contact } from '../contact-manager';
import type { MessageEnvelope } from '../direct-message-session';

const ITERS = 1000;

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

describe('Sealed sender — Envelope v3 (ticket 16)', () => {
  test('S3: the wire envelope carries ZERO sender identity', async () => {
    const alice = await makeStack('alice');
    const bob = await makeStack('bob');
    const contactB = contactFromBundle('cB', 'bob', bob.bundle);

    const envelopes: MessageEnvelope[] = [];
    await alice.client.sendToContact(contactB, 'where is the sender?', undefined, async (roomId, env) => {
      envelopes.push(env);
      void roomId;
    });

    const first = envelopes[0];
    expect(first.version).toBe(3);
    expect(first.senderId).toBeUndefined();
    expect(first.senderIdentityPublic).toBeUndefined();
    // No identity material anywhere in the serialised frame — not even embedded strings
    const serialised = JSON.stringify(first);
    expect(serialised).not.toContain(alice.bundle.identityPublicKeySpkiB64);
    expect(serialised).not.toContain(alice.bundle.identitySigningPublicKeySpkiB64);
  });

  test('S3: the recipient authenticates the sender from inside the ciphertext', async () => {
    const alice = await makeStack('alice');
    const bob = await makeStack('bob');
    const contactB = contactFromBundle('cB', 'bob', bob.bundle);

    const inbox = await deriveInboxRoomId(bob.bundle.identityPublicKeySpkiB64);
    const seen: MessageEnvelope[] = [];
    await alice.client.sendToContact(contactB, 'authenticate me', undefined, async (_room, env) => {
      seen.push(env);
      void _room;
    });

    const delivered = await bob.client.handleInboundEnvelope(seen[seen.length - 1]);
    expect(delivered).not.toBeNull();
    expect(delivered!.content).toBe('authenticate me');
    // Who sent this is a decryption OUTPUT (SPKI of alice's identity key)
    expect(delivered!.senderIdentityPublic).toBe(alice.bundle.identityPublicKeySpkiB64);
    void inbox;
  });

  test('fail closed: an unsigned first message is refused — no identity, no session', async () => {
    const { generateIdentityKeys, generateEphemeralKeys } = await import('./crypto-keygen');
    const bobKeys = await generateIdentityKeys();
    const bobPreKeys = await generateEphemeralKeys();
    const bobSigning = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const toB64 = async (k: CryptoKey) =>
      btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.exportKey('spki', k))));
    const preKeySpkiB64 = await toB64(bobPreKeys.publicKey);
    const preKeyBytes = new Uint8Array(Array.from(atob(preKeySpkiB64), (c) => c.charCodeAt(0)));
    const preKeySignature = btoa(
      String.fromCharCode(
        ...new Uint8Array(
          await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, bobSigning.privateKey, preKeyBytes),
        ),
      ),
    );
    const contactB: Contact = {
      id: 'cB',
      alias: 'bob',
      identity: {
        id: 'user_bob',
        identityPublicKey: JSON.stringify(await crypto.subtle.exportKey('jwk', bobKeys.publicKey)),
        preKeyPublic: JSON.stringify(await crypto.subtle.exportKey('jwk', bobPreKeys.publicKey)),
        preKeyId: 1,
        fingerprint: 'fp',
        identitySigningPublicKey: await toB64(bobSigning.publicKey),
        preKeySignature,
      },
      verified: false,
      verificationCode: '',
      addedAt: new Date(),
      encryptionStatus: 'established',
    };

    // An initiator WITHOUT signing keys cannot produce an authenticatable first payload
    const aliceIdentity = await generateIdentityKeys();
    const aliceSession = new DirectMessageSession({ selfUserId: 'alice', selfIdentityKeys: aliceIdentity });
    await aliceSession.initiate(contactB);
    const envelope = await aliceSession.sendMessage('unsigned');

    const bobSession = new DirectMessageSession({
      selfUserId: 'user_bob',
      selfIdentityKeys: bobKeys,
      selfPreKeys: { id: 1, publicKey: bobPreKeys.publicKey, privateKey: bobPreKeys.privateKey },
    });
    await expect(bobSession.receiveEnvelope(envelope)).rejects.toThrow(/no authenticatable sender identity/);
  });

  test('tampered wire context fails authentication (AAD)', async () => {
    const alice = await makeStack('alice');
    const bob = await makeStack('bob');
    const contactB = contactFromBundle('cB', 'bob', bob.bundle);
    const seen: MessageEnvelope[] = [];
    await alice.client.sendToContact(contactB, 'tamper test', undefined, async (_r, env) => {
      seen.push(env);
    });

    const legit = seen[seen.length - 1];
    // Route the SAME envelope to bob under a DIFFERENT channel id: AAD mismatch
    const spoofed: MessageEnvelope = { ...legit, channelId: 'dm_deadbeefdeadbeef' };
    await expect(bob.client.handleInboundEnvelope(spoofed)).rejects.toThrow();
  });
});
