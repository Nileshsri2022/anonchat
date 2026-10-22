import { describe, test, expect } from 'bun:test';
import { DirectMessageSession, derivePairwiseChannelId } from '../direct-message-session';
import { generateIdentityKeys, generateEphemeralKeys } from '../crypto';
import type { Contact } from '../contact-manager';

describe('DirectMessageSession - Slice 1: Handshake & First Message', () => {
  test('Alice initiates session with Bob and Bob decrypts the first message envelope', async () => {
    // 1. Setup Bob's identity and pre-key (as would be scanned from QR)
    const bobIdentityKeys = await generateIdentityKeys();
    const bobPreKeys = await generateEphemeralKeys();

    // Export Bob's public keys to string/format as stored in Contact
    const bobContact: Contact = {
      id: 'contact_bob_123',
      alias: 'Bob',
      identity: {
        id: 'user_bob',
        identityPublicKey: JSON.stringify(await crypto.subtle.exportKey('jwk', bobIdentityKeys.publicKey)),
        preKeyPublic: JSON.stringify(await crypto.subtle.exportKey('jwk', bobPreKeys.publicKey)),
        preKeyId: 1,
        fingerprint: 'bob-fingerprint-1234',
      },
      verified: true,
      verificationCode: '123456',
      addedAt: new Date(),
      encryptionStatus: 'verified',
    };

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
    const bobIdentityKeys = await generateIdentityKeys();
    const bobPreKeys = await generateEphemeralKeys();

    const bobContact: Contact = {
      id: 'contact_bob_123',
      alias: 'Bob',
      identity: {
        id: 'user_bob',
        identityPublicKey: JSON.stringify(await crypto.subtle.exportKey('jwk', bobIdentityKeys.publicKey)),
        preKeyPublic: JSON.stringify(await crypto.subtle.exportKey('jwk', bobPreKeys.publicKey)),
        preKeyId: 1,
        fingerprint: 'bob-fingerprint-1234',
      },
      verified: true,
      verificationCode: '123456',
      addedAt: new Date(),
      encryptionStatus: 'verified',
    };

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
    const bobIdentityKeys = await generateIdentityKeys();
    const bobPreKeys = await generateEphemeralKeys();

    const bobContact: Contact = {
      id: 'contact_bob_123',
      alias: 'Bob',
      identity: {
        id: 'user_bob',
        identityPublicKey: JSON.stringify(await crypto.subtle.exportKey('jwk', bobIdentityKeys.publicKey)),
        preKeyPublic: JSON.stringify(await crypto.subtle.exportKey('jwk', bobPreKeys.publicKey)),
        preKeyId: 1,
        fingerprint: 'bob-fingerprint-1234',
      },
      verified: true,
      verificationCode: '123456',
      addedAt: new Date(),
      encryptionStatus: 'verified',
    };

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
    const bobIdentityKeys = await generateIdentityKeys();
    const bobPreKeys = await generateEphemeralKeys();

    const bobContact: Contact = {
      id: 'contact_bob_123',
      alias: 'Bob',
      identity: {
        id: 'user_bob',
        identityPublicKey: JSON.stringify(await crypto.subtle.exportKey('jwk', bobIdentityKeys.publicKey)),
        preKeyPublic: JSON.stringify(await crypto.subtle.exportKey('jwk', bobPreKeys.publicKey)),
        preKeyId: 1,
        fingerprint: 'bob-fingerprint-1234',
      },
      verified: true,
      verificationCode: '123456',
      addedAt: new Date(),
      encryptionStatus: 'verified',
    };

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
