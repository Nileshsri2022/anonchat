import { describe, test, expect } from 'bun:test';
import { DirectMessageSession, derivePairwiseChannelId } from '../direct-message-session';
import { generateIdentityKeys, generateEphemeralKeys } from '../crypto';
import type { Contact } from '../contact-manager';

/** Builds Bob's side: identity keys, pre-keys, and a signed Contact bundle (as an Invite would carry). */
async function makeBobBundle() {
  const bobIdentityKeys = await generateIdentityKeys();
  const bobPreKeys = await generateEphemeralKeys();
  const bobSigning = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const preKeySpkiB64 = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.exportKey('spki', bobPreKeys.publicKey))));
  const signingSpkiB64 = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.exportKey('spki', bobSigning.publicKey))));
  const preKeySignature = btoa(String.fromCharCode(...new Uint8Array(
    await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      bobSigning.privateKey,
      Uint8Array.from(atob(preKeySpkiB64), (c) => c.charCodeAt(0)),
    ),
  )));
  const bobContact: Contact = {
    id: 'contact_bob_123',
    alias: 'Bob',
    identity: {
      id: 'user_bob',
      identityPublicKey: JSON.stringify(await crypto.subtle.exportKey('jwk', bobIdentityKeys.publicKey)),
      preKeyPublic: JSON.stringify(await crypto.subtle.exportKey('jwk', bobPreKeys.publicKey)),
      preKeyId: 1,
      fingerprint: 'bob-fingerprint-1234',
      identitySigningPublicKey: signingSpkiB64,
      preKeySignature,
    },
    verified: true,
    verificationCode: '123456',
    addedAt: new Date(),
    encryptionStatus: 'verified',
  };
  return { bobIdentityKeys, bobPreKeys, bobContact };
}


describe('DirectMessageSession - Slice 1: Handshake & First Message', () => {
  test('Alice initiates session with Bob and Bob decrypts the first message envelope', async () => {
    // 1. Setup Bob's identity and pre-key (as would be scanned from QR)
    const { bobIdentityKeys, bobPreKeys, bobContact } = await makeBobBundle();

    // Alice's own identity keys
    const aliceIdentityKeys = await generateIdentityKeys();
    const aliceIdentity = {
      id: 'user_alice',
      keys: aliceIdentityKeys,
    };

    // Alice initiates session to Bob
    const aliceSession = new DirectMessageSession({
      selfUserId: aliceIdentity.id,
      selfIdentityKeys: aliceIdentity.keys,
    });
    await aliceSession.initiate(bobContact);

    // Alice sends a message
    const envelope = await aliceSession.sendMessage('Hello Bob, secure over Tor!');
    expect(envelope).toBeDefined();
    expect(envelope.ciphertext).toBeDefined();
    expect(envelope.header).toBeDefined();

    // Bob initializes his session with Alice
    const bobSession = new DirectMessageSession({
      selfUserId: 'user_bob',
      selfIdentityKeys: bobIdentityKeys,
      selfPreKeys: {
        id: 1,
        publicKey: bobPreKeys.publicKey,
        privateKey: bobPreKeys.privateKey,
      },
    });

    // Bob receives and decrypts Alice's envelope
    const decrypted = await bobSession.receiveEnvelope(envelope);
    expect(decrypted.content).toBe('Hello Bob, secure over Tor!');
    expect(decrypted.senderId).toBe('user_alice');
  });
});

describe('DirectMessageSession - Slice 2: Bidirectional Ratcheting & Turn Taking', () => {
  test('Alice and Bob exchange multiple messages with DH ratchet rotations', async () => {
    const { bobIdentityKeys, bobPreKeys, bobContact } = await makeBobBundle();

    const aliceIdentityKeys = await generateIdentityKeys();
    const aliceSession = new DirectMessageSession({
      selfUserId: 'user_alice',
      selfIdentityKeys: aliceIdentityKeys,
    });
    await aliceSession.initiate(bobContact);

    const bobSession = new DirectMessageSession({
      selfUserId: 'user_bob',
      selfIdentityKeys: bobIdentityKeys,
      selfPreKeys: {
        id: 1,
        publicKey: bobPreKeys.publicKey,
        privateKey: bobPreKeys.privateKey,
      },
    });

    // Turn 1: Alice -> Bob (M1)
    const env1 = await aliceSession.sendMessage('M1: Hi Bob from Alice');
    const dec1 = await bobSession.receiveEnvelope(env1);
    expect(dec1.content).toBe('M1: Hi Bob from Alice');

    // Turn 2: Bob -> Alice (M2)
    const env2 = await bobSession.sendMessage('M2: Hi Alice from Bob');
    const dec2 = await aliceSession.receiveEnvelope(env2);
    expect(dec2.content).toBe('M2: Hi Alice from Bob');

    // Turn 3: Alice -> Bob (M3)
    const env3 = await aliceSession.sendMessage('M3: How is Tor routing today?');
    const dec3 = await bobSession.receiveEnvelope(env3);
    expect(dec3.content).toBe('M3: How is Tor routing today?');

    // Turn 4: Bob -> Alice (M4)
    const env4 = await bobSession.sendMessage('M4: Three hops, perfect forward secrecy!');
    const dec4 = await aliceSession.receiveEnvelope(env4);
    expect(dec4.content).toBe('M4: Three hops, perfect forward secrecy!');
  });
});

describe('DirectMessageSession - Slice 3: Out-of-Order Delivery & Skipped-Key Cache', () => {
  test('Bob receives delayed and out-of-order messages correctly using skipped-key cache', async () => {
    const { bobIdentityKeys, bobPreKeys, bobContact } = await makeBobBundle();

    const aliceIdentityKeys = await generateIdentityKeys();
    const aliceSession = new DirectMessageSession({
      selfUserId: 'user_alice',
      selfIdentityKeys: aliceIdentityKeys,
    });
    await aliceSession.initiate(bobContact);

    const bobSession = new DirectMessageSession({
      selfUserId: 'user_bob',
      selfIdentityKeys: bobIdentityKeys,
      selfPreKeys: {
        id: 1,
        publicKey: bobPreKeys.publicKey,
        privateKey: bobPreKeys.privateKey,
      },
    });

    // Alice sends 4 messages in sequence
    const env0 = await aliceSession.sendMessage('Message 0');
    const env1 = await aliceSession.sendMessage('Message 1');
    const env2 = await aliceSession.sendMessage('Message 2');
    const env3 = await aliceSession.sendMessage('Message 3');

    // Bob receives Message 3 first (M0, M1, M2 skipped)
    const dec3 = await bobSession.receiveEnvelope(env3);
    expect(dec3.content).toBe('Message 3');

    // Bob receives Message 1 next
    const dec1 = await bobSession.receiveEnvelope(env1);
    expect(dec1.content).toBe('Message 1');

    // Bob receives Message 0 next
    const dec0 = await bobSession.receiveEnvelope(env0);
    expect(dec0.content).toBe('Message 0');

    // Bob receives Message 2 last
    const dec2 = await bobSession.receiveEnvelope(env2);
    expect(dec2.content).toBe('Message 2');
  });
});

describe('DirectMessageSession - Slice 4: Pairwise Channel ID & Disappearing Messages', () => {
  test('Pairwise Channel ID is deterministic regardless of key order', async () => {
    const keyA = 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE11111111111111111111111111111111111111111111111111111111111111111111111111111111111111==';
    const keyB = 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE22222222222222222222222222222222222222222222222222222222222222222222222222222222222222==';

    const channel1 = await derivePairwiseChannelId(keyA, keyB);
    const channel2 = await derivePairwiseChannelId(keyB, keyA);

    expect(channel1).toBe(channel2);
    expect(channel1.startsWith('dm_')).toBe(true);
    expect(channel1.length).toBe(3 + 64); // 'dm_' + 64 hex characters

    // Explicitly verify ADR-0001 format: dm_${sha256(min(pkA, pkB) + ":" + max(pkA, pkB))}
    const sorted = [keyA, keyB].sort();
    const expectedHash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${sorted[0]}:${sorted[1]}`));
    const expectedHex = Array.from(new Uint8Array(expectedHash)).map(b => b.toString(16).padStart(2, '0')).join('');
    expect(channel1).toBe(`dm_${expectedHex}`);
  });

  test('Envelope and decrypted message carry synchronized TTL and expiresAt timestamps', async () => {
    const { bobIdentityKeys, bobPreKeys, bobContact } = await makeBobBundle();

    const aliceIdentityKeys = await generateIdentityKeys();
    const aliceSession = new DirectMessageSession({
      selfUserId: 'user_alice',
      selfIdentityKeys: aliceIdentityKeys,
    });
    await aliceSession.initiate(bobContact);

    const bobSession = new DirectMessageSession({
      selfUserId: 'user_bob',
      selfIdentityKeys: bobIdentityKeys,
      selfPreKeys: {
        id: 1,
        publicKey: bobPreKeys.publicKey,
        privateKey: bobPreKeys.privateKey,
      },
    });

    const ttlMs = 30 * 1000; // 30 seconds
    const envelope = await aliceSession.sendMessage('Secret self-destructing message', { ttl: ttlMs });

    expect(envelope.ttl).toBe(ttlMs);
    expect(envelope.expiresAt).toBeDefined();
    expect(envelope.expiresAt).toBe(envelope.timestamp + ttlMs);

    const decrypted = await bobSession.receiveEnvelope(envelope);
    expect(decrypted.ttl).toBe(ttlMs);
    expect(decrypted.expiresAt).toBe(envelope.expiresAt);
    expect(decrypted.content).toBe('Secret self-destructing message');
  });
});

describe('DirectMessageSession - Ticket 03: Protocol Hardening', () => {
  test('initiate rejects a Contact whose Pre-Key signature is missing or invalid', async () => {
    const { generateEphemeralKeys } = await import('../crypto');
    const { DirectMessageSession } = await import('../direct-message-session');

    const crypto = globalThis.crypto;
    const aliceKeys = await generateEphemeralKeys();

    // Bob's real key material with a signing pair
    const bobIdentity = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
    const bobPreKey = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
    const bobSigning = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const preKeySpki = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.exportKey('spki', bobPreKey.publicKey))));
    const signingSpki = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.exportKey('spki', bobSigning.publicKey))));
    const goodSig = btoa(String.fromCharCode(...new Uint8Array(
      await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, bobSigning.privateKey,
        Uint8Array.from(atob(preKeySpki), (c) => c.charCodeAt(0))),
    )));
    const badSig = btoa(String.fromCharCode(...new Uint8Array(await crypto.getRandomValues(new Uint8Array(64)))));

    const mkContact = async (signature?: string) => ({
      id: 'c1',
      alias: 'Bob',
      identity: {
        id: 'user_bob',
        identityPublicKey: JSON.stringify(await crypto.subtle.exportKey('jwk', bobIdentity.publicKey)),
        preKeyPublic: preKeySpki,
        preKeyId: 1,
        fingerprint: 'bob-fp',
        identitySigningPublicKey: signingSpki,
        preKeySignature: signature,
      },
      verified: false,
      verificationCode: '',
      addedAt: new Date(),
      encryptionStatus: 'pending',
    }) as any;

    // Valid signature → accepted (session established)
    const ok = new DirectMessageSession({ selfUserId: 'alice', selfIdentityKeys: aliceKeys });
    await ok.initiate(await mkContact(goodSig));
    expect(ok.getChannelId()).toBeDefined();

    // Missing signature → rejected
    const missing = new DirectMessageSession({ selfUserId: 'alice', selfIdentityKeys: await generateEphemeralKeys() });
    await expect(missing.initiate(await mkContact(undefined))).rejects.toThrow(/signature/i);

    // Invalid signature → rejected
    const invalid = new DirectMessageSession({ selfUserId: 'alice', selfIdentityKeys: await generateEphemeralKeys() });
    await expect(invalid.initiate(await mkContact(badSig))).rejects.toThrow(/signature/i);
  });
});

describe('DirectMessageSession - Ticket 03: Replay & Tamper', () => {
  test('a replayed envelope is rejected with an explicit replay error', async () => {
    const { DirectMessageSession } = await import('../direct-message-session');
    const { bobIdentityKeys, bobPreKeys, bobContact } = await makeBobBundle();
    const aliceKeys = await generateIdentityKeys();

    const aliceSession = new DirectMessageSession({ selfUserId: 'user_alice', selfIdentityKeys: aliceKeys });
    await aliceSession.initiate(bobContact);

    const bobSession = new DirectMessageSession({
      selfUserId: 'user_bob',
      selfIdentityKeys: bobIdentityKeys,
      selfPreKeys: { id: 1, publicKey: bobPreKeys.publicKey, privateKey: bobPreKeys.privateKey },
    });

    const envelope = await aliceSession.sendMessage('first');
    await bobSession.receiveEnvelope(envelope); // first delivery succeeds

    // Replaying the exact same envelope must be rejected
    await expect(bobSession.receiveEnvelope(envelope)).rejects.toThrow(/replay/i);
  });
});

describe('DirectMessageSession - Ticket 03: Header Authentication', () => {
  test('an envelope with a tampered Pairwise Channel ID fails authentication', async () => {
    const { DirectMessageSession } = await import('../direct-message-session');
    const { bobIdentityKeys, bobPreKeys, bobContact } = await makeBobBundle();
    const aliceKeys = await generateIdentityKeys();

    const aliceSession = new DirectMessageSession({ selfUserId: 'user_alice', selfIdentityKeys: aliceKeys });
    await aliceSession.initiate(bobContact);
    const envelope = await aliceSession.sendMessage('context switching attack?');

    const bobSession = new DirectMessageSession({
      selfUserId: 'user_bob',
      selfIdentityKeys: bobIdentityKeys,
      selfPreKeys: { id: 1, publicKey: bobPreKeys.publicKey, privateKey: bobPreKeys.privateKey },
    });

    const tampered = { ...envelope, channelId: 'dm_0000000000000000000000000000000000000000000000000000000000000000' };
    await expect(bobSession.receiveEnvelope(tampered)).rejects.toThrow(/authenticat|tamper|fail/i);
  });

  test('an envelope with tampered ciphertext fails authentication', async () => {
    const { DirectMessageSession } = await import('../direct-message-session');
    const { bobIdentityKeys, bobPreKeys, bobContact } = await makeBobBundle();
    const aliceKeys = await generateIdentityKeys();

    const aliceSession = new DirectMessageSession({ selfUserId: 'user_alice', selfIdentityKeys: aliceKeys });
    await aliceSession.initiate(bobContact);
    const envelope = await aliceSession.sendMessage('do not modify me');

    const bobSession = new DirectMessageSession({
      selfUserId: 'user_bob',
      selfIdentityKeys: bobIdentityKeys,
      selfPreKeys: { id: 1, publicKey: bobPreKeys.publicKey, privateKey: bobPreKeys.privateKey },
    });

    const flipped = atob(envelope.ciphertext);
    const flippedByte = String.fromCharCode(flipped.charCodeAt(0) ^ 0x01) + flipped.slice(1);
    const tampered = { ...envelope, ciphertext: btoa(flippedByte) };
    await expect(bobSession.receiveEnvelope(tampered)).rejects.toThrow();
  });
});

describe('DirectMessageSession - Ticket 03: Skipped-Key Cache bound', () => {
  test('the Skipped-Key Cache is bounded: keys evicted past the bound fail explicitly', async () => {
    const { DirectMessageSession } = await import('../direct-message-session');
    const { bobIdentityKeys, bobPreKeys, bobContact } = await makeBobBundle();
    const aliceKeys = await generateIdentityKeys();

    const aliceSession = new DirectMessageSession({ selfUserId: 'user_alice', selfIdentityKeys: aliceKeys });
    await aliceSession.initiate(bobContact);

    const bobSession = new DirectMessageSession({
      selfUserId: 'user_bob',
      selfIdentityKeys: bobIdentityKeys,
      selfPreKeys: { id: 1, publicKey: bobPreKeys.publicKey, privateKey: bobPreKeys.privateKey },
      maxSkippedKeys: 5,
    });

    // Alice sends 6 messages; Bob receives them in reverse (all skipped initially)
    const envelopes = [];
    for (let i = 1; i <= 7; i++) envelopes.push(await aliceSession.sendMessage(`msg-${i}`));

    const outcomes: string[] = [];
    for (const env of [...envelopes].reverse()) {
      try {
        await bobSession.receiveEnvelope(env);
        outcomes.push('ok');
      } catch (e) {
        outcomes.push(e instanceof Error ? e.message : 'unknown');
      }
    }

    // Exactly the oldest (evicted) message must fail, and it must fail loudly
    expect(outcomes.filter((o) => o === 'ok').length).toBe(6);
    expect(outcomes[6]).toMatch(/skip/i);
  });
});
