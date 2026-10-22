import { describe, test, expect } from 'bun:test';
import { MemoryKVStore } from '../kv-store';
import { IdentityVault } from '../identity-vault';

describe('IdentityVault', () => {
  test('creates an identity whose signed Pre-Key signature verifies against the signing key', async () => {
    const vault = await IdentityVault.create({ store: new MemoryKVStore() });
    const data = await vault.getIdentityData();

    // Identity and signing material present
    expect(data.identity.publicKeySpkiB64.length).toBeGreaterThan(0);
    expect(data.identity.privateKeyJwk).toBeDefined();
    expect(data.signing.publicKeySpkiB64.length).toBeGreaterThan(0);
    expect(data.signedPreKey.id).toBeGreaterThan(0);
    expect(data.signedPreKey.publicKeySpkiB64.length).toBeGreaterThan(0);

    // The Pre-Key signature verifies under the signing public key over the Pre-Key public bytes
    const crypto = globalThis.crypto;
    const signingPub = await crypto.subtle.importKey(
      'spki',
      Uint8Array.from(atob(data.signing.publicKeySpkiB64), (c) => c.charCodeAt(0)),
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['verify'],
    );
    const preKeyBytes = Uint8Array.from(atob(data.signedPreKey.publicKeySpkiB64), (c) => c.charCodeAt(0));
    const sigBytes = Uint8Array.from(atob(data.signedPreKey.signatureB64), (c) => c.charCodeAt(0));
    const valid = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      signingPub,
      sigBytes,
      preKeyBytes,
    );
    expect(valid).toBe(true);
  });

  test('persists the identity: loading from the same store yields the identical keys and fingerprint', async () => {
    const store = new MemoryKVStore();
    const created = await IdentityVault.create({ store });
    const original = await created.getIdentityData();

    // Simulates an app reload: a brand-new instance reading the same persisted store.
    const reloaded = await IdentityVault.load({ store });
    expect(reloaded).not.toBeNull();
    const restored = await reloaded!.getIdentityData();

    expect(restored.identity.publicKeySpkiB64).toBe(original.identity.publicKeySpkiB64);
    expect(restored.signing.publicKeySpkiB64).toBe(original.signing.publicKeySpkiB64);
    expect(restored.signedPreKey.publicKeySpkiB64).toBe(original.signedPreKey.publicKeySpkiB64);
    expect(restored.signedPreKey.signatureB64).toBe(original.signedPreKey.signatureB64);
  });

  test('load returns null when no identity was ever created', async () => {
    const empty = await IdentityVault.load({ store: new MemoryKVStore() });
    expect(empty).toBeNull();
  });

  test('seal locks the vault; unlock with wrong passphrase keeps it locked; correct passphrase restores access', async () => {
    const store = new MemoryKVStore();
    const vault = await IdentityVault.create({ store, iterations: 1000 });
    const before = await vault.getIdentityData();

    await vault.seal('correct horse battery staple');
    expect(vault.isSealed()).toBe(true);
    expect(vault.hasPassphrase()).toBe(true);
    await expect(vault.getIdentityData()).rejects.toThrow(/sealed/i);

    const wrong = await vault.unlock('wrong-passphrase');
    expect(wrong).toBe(false);
    await expect(vault.getIdentityData()).rejects.toThrow(/sealed/i);

    const right = await vault.unlock('correct horse battery staple');
    expect(right).toBe(true);
    const after = await vault.getIdentityData();
    expect(after.identity.publicKeySpkiB64).toBe(before.identity.publicKeySpkiB64);

    // A fresh load of a sealed vault must come back sealed, not leak plaintext.
    const reloaded = await IdentityVault.load({ store });
    expect(reloaded!.isSealed()).toBe(true);
    await expect(reloaded!.getIdentityData()).rejects.toThrow(/sealed/i);

    // Lock again after unlock.
    await reloaded!.unlock('correct horse battery staple');
    await reloaded!.lock();
    await expect(reloaded!.getIdentityData()).rejects.toThrow(/sealed/i);

    // Removing the passphrase returns to an unsealed vault.
    await reloaded!.unlock('correct horse battery staple');
    await reloaded!.removePassphrase();
    expect(reloaded!.isSealed()).toBe(false);
    expect(reloaded!.hasPassphrase()).toBe(false);
    await expect(reloaded!.getIdentityData()).resolves.toBeDefined();
  });

  test('a sealed vault record contains no plaintext key material', async () => {
    const store = new MemoryKVStore();
    const vault = await IdentityVault.create({ store, iterations: 1000 });
    const data = await vault.getIdentityData();
    await vault.seal('passphrase-123');

    // Structural check: a sealed record carries only the sealed blob, never plaintext fields.
    const rawRecord = JSON.stringify(await store.get('identity'));
    expect(rawRecord).not.toContain('privateKeyJwk');
    expect(rawRecord).not.toContain('publicKeySpkiB64');
    const record = (await store.get('identity')) as {
      ciphertextB64?: string;
      saltB64?: string;
      unsealed?: boolean;
      data?: unknown;
    };
    expect(record.ciphertextB64).toBeDefined();
    expect(record.saltB64).toBeDefined();
    expect(record.unsealed).toBe(false);
    expect(record.data).toBeUndefined();
  });

  test('destroy removes the identity; the next load is empty', async () => {
    const store = new MemoryKVStore();
    const vault = await IdentityVault.create({ store });
    await vault.destroy();
    expect(await IdentityVault.load({ store })).toBeNull();
  });
});

describe('IdentityVault — key material access', () => {
  test('provides usable ECDH identity and pre-key pairs (imported from persisted JWKs)', async () => {
    const { generateEphemeralKeys } = await import('../crypto');
    const store = new MemoryKVStore();
    const vault = await IdentityVault.create({ store, iterations: 1000 });

    const identity = await vault.getIdentityKeyPair();
    expect(identity.publicKey).toBeDefined();
    expect(identity.privateKey).toBeDefined();

    const preKey = await vault.getPreKeyPair();
    expect(preKey.id).toBeGreaterThan(0);

    // The identity private key can actually perform ECDH with a remote public key
    const remote = await generateEphemeralKeys();
    const bits = await crypto.subtle.deriveBits(
      { name: 'ECDH', public: remote.publicKey },
      identity.privateKey,
      256,
    );
    expect(bits.byteLength).toBe(32);
  });

  test('a reloaded vault yields the same public keys (stable identity across reloads)', async () => {
    const store = new MemoryKVStore();
    const created = await IdentityVault.create({ store, iterations: 1000 });
    const before = await created.getIdentityKeyPair();
    const beforeSpki = await crypto.subtle.exportKey('spki', before.publicKey);

    const reloaded = (await IdentityVault.load({ store }))!;
    const after = await reloaded.getIdentityKeyPair();
    const afterSpki = await crypto.subtle.exportKey('spki', after.publicKey);

    expect(Buffer.from(beforeSpki).equals(Buffer.from(afterSpki))).toBe(true);
  });
});
