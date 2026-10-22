// Identity Vault: generates and persists the user's long-term identity material
// (identity key pair, signing key pair, signed Pre-Key) and seals all of it at rest
// with AES-256-GCM under a key derived from an optional Profile Passphrase (ADR-0004).
//
// Sealed format: PBKDF2-SHA-256 (random 16-byte salt) -> AES-256-GCM over the JSON
// vault data, with "anonchat-vault-v1" bound as additional authenticated data.

import { ml_kem768 } from '@noble/post-quantum/ml-kem.js';

import type { KVStore } from './kv-store';

const VAULT_RECORD_KEY = 'identity';
const AAD = 'anonchat-vault-v1';
export const DEFAULT_PBKDF2_ITERATIONS = 310_000;

export interface IdentityVaultData {
  version: 1;
  identity: { publicKeySpkiB64: string; privateKeyJwk: JsonWebKey };
  signing: { publicKeySpkiB64: string; privateKeyJwk: JsonWebKey };
  signedPreKey: {
    id: number;
    publicKeySpkiB64: string;
    privateKeyJwk: JsonWebKey;
    signatureB64: string;
  };
  /** ML-KEM-768 keypair for the hybrid post-quantum handshake (ADR-0006). Optional for pre-PQ records. */
  pqKem?: { publicKeyB64: string; secretKeyB64: string };
  createdAt: number;
}

interface VaultRecord {
  version: 1;
  unsealed: boolean;
  data?: IdentityVaultData; // present only when unsealed
  ciphertextB64?: string; // present only when sealed
  saltB64?: string;
  iterations?: number;
  createdAt: number;
}

export interface IdentityVaultOptions {
  store: KVStore;
  iterations?: number;
}

export class SealedVaultError extends Error {
  constructor() {
    super('Vault is sealed; unlock with the Profile Passphrase to access identity material');
    this.name = 'SealedVaultError';
  }
}

function bufferToBase64(buffer: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const raw = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function deriveWrappingKey(passphrase: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, [
    'deriveKey',
  ]);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function generateEcdhKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
}

async function generateSigningKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
}

async function exportPublicSpkiB64(key: CryptoKey): Promise<string> {
  return bufferToBase64(await crypto.subtle.exportKey('spki', key));
}

export class IdentityVault {
  private record: VaultRecord | null = null;
  private unlockedData: IdentityVaultData | null = null;
  private readonly store: KVStore;
  private readonly iterations: number;

  private constructor(store: KVStore, iterations: number) {
    this.store = store;
    this.iterations = iterations;
  }

  /** Generate a fresh identity and persist it (unsealed). */
  static async create(options: IdentityVaultOptions): Promise<IdentityVault> {
    const vault = new IdentityVault(options.store, options.iterations ?? DEFAULT_PBKDF2_ITERATIONS);

    const identityPair = await generateEcdhKeyPair();
    const signingPair = await generateSigningKeyPair();
    const preKeyPair = await generateEcdhKeyPair();
    const pqPair = ml_kem768.keygen();

    const preKeyPublicSpkiB64 = await exportPublicSpkiB64(preKeyPair.publicKey);
    const signatureB64 = bufferToBase64(
      await crypto.subtle.sign(
        { name: 'ECDSA', hash: 'SHA-256' },
        signingPair.privateKey,
        base64ToBytes(preKeyPublicSpkiB64),
      ),
    );

    const data: IdentityVaultData = {
      version: 1,
      identity: {
        publicKeySpkiB64: await exportPublicSpkiB64(identityPair.publicKey),
        privateKeyJwk: await crypto.subtle.exportKey('jwk', identityPair.privateKey),
      },
      signing: {
        publicKeySpkiB64: await exportPublicSpkiB64(signingPair.publicKey),
        privateKeyJwk: await crypto.subtle.exportKey('jwk', signingPair.privateKey),
      },
      signedPreKey: {
        id: 1,
        publicKeySpkiB64: preKeyPublicSpkiB64,
        privateKeyJwk: await crypto.subtle.exportKey('jwk', preKeyPair.privateKey),
        signatureB64,
      },
      pqKem: {
        publicKeyB64: bufferToBase64(pqPair.publicKey.slice().buffer as ArrayBuffer),
        secretKeyB64: bufferToBase64(pqPair.secretKey.slice().buffer as ArrayBuffer),
      },
      createdAt: Date.now(),
    };

    vault.unlockedData = data;
    vault.record = {
      version: 1,
      unsealed: true,
      data,
      createdAt: data.createdAt,
    };
    await vault.persist();
    return vault;
  }

  /** Load the persisted vault, or null when no identity exists yet. */
  static async load(options: IdentityVaultOptions): Promise<IdentityVault | null> {
    const vault = new IdentityVault(options.store, options.iterations ?? DEFAULT_PBKDF2_ITERATIONS);
    const record = (await options.store.get(VAULT_RECORD_KEY)) as VaultRecord | undefined;
    if (!record) return null;
    vault.record = record;
    if (record.unsealed && record.data) {
      vault.unlockedData = record.data;
    }
    return vault;
  }

  private async persist(): Promise<void> {
    await this.store.set(VAULT_RECORD_KEY, this.record);
  }

  isSealed(): boolean {
    return this.record !== null && !this.record.unsealed;
  }

  hasPassphrase(): boolean {
    return this.record !== null && typeof this.record.saltB64 === 'string';
  }

  /**
   * Seal (or re-seal) the vault under a Profile Passphrase.
   * The plaintext is removed from the record; unlock() restores access.
   */
  async seal(passphrase: string): Promise<void> {
    if (!passphrase) throw new Error('Profile Passphrase must not be empty');
    const data = await this.getIdentityData();

    const salt = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(16)));
    const key = await deriveWrappingKey(passphrase, salt, this.iterations);
    const iv = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(12)));
    const plaintext = new TextEncoder().encode(JSON.stringify(data));
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(AAD) }, key, plaintext);

    // Sealed blob layout: iv(12) || ciphertext
    const blob = new Uint8Array(new ArrayBuffer(12 + ciphertext.byteLength));
    blob.set(iv, 0);
    blob.set(new Uint8Array(ciphertext), 12);

    this.unlockedData = null;
    this.record = {
      version: 1,
      unsealed: false,
      ciphertextB64: bufferToBase64(blob.buffer as ArrayBuffer),
      saltB64: bufferToBase64(salt.buffer as ArrayBuffer),
      iterations: this.iterations,
      createdAt: this.record?.createdAt ?? Date.now(),
    };
    await this.persist();
  }

  /** Remove the Profile Passphrase and store the vault unsealed. */
  async removePassphrase(): Promise<void> {
    const data = await this.getIdentityData();
    this.unlockedData = data;
    this.record = {
      version: 1,
      unsealed: true,
      data,
      createdAt: this.record?.createdAt ?? Date.now(),
    };
    await this.persist();
  }

  /** Unlock a sealed vault. Returns false on a wrong passphrase without changing state. */
  async unlock(passphrase: string): Promise<boolean> {
    if (this.record === null) throw new Error('No vault loaded');
    if (this.record.unsealed) return true;
    if (!this.record.ciphertextB64 || !this.record.saltB64) throw new Error('Sealed vault record is malformed');

    // The sealed blob is iv(12 bytes) || ciphertext.
    const salt = base64ToBytes(this.record.saltB64);
    const key = await deriveWrappingKey(passphrase, salt, this.record.iterations ?? this.iterations);
    const blob = base64ToBytes(this.record.ciphertextB64);
    const iv = blob.slice(0, 12);
    const ciphertext = blob.slice(12);
    try {
      const plaintext = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(AAD) },
        key,
        ciphertext,
      );
      this.unlockedData = JSON.parse(new TextDecoder().decode(plaintext)) as IdentityVaultData;
      return true;
    } catch {
      return false;
    }
  }

  async lock(): Promise<void> {
    if (this.record !== null && !this.record.unsealed) {
      this.unlockedData = null;
    }
  }

  /** Identity material; throws while the vault is sealed and locked. */
  async getIdentityData(): Promise<IdentityVaultData> {
    if (this.unlockedData) return this.unlockedData;
    if (this.record !== null && !this.record.unsealed) throw new SealedVaultError();
    throw new Error('No identity data available');
  }

  /** The long-term identity key pair as usable CryptoKeys. */
  async getIdentityKeyPair(): Promise<{ publicKey: CryptoKey; privateKey: CryptoKey }> {
    const data = await this.getIdentityData();
    const publicKey = await crypto.subtle.importKey(
      'spki',
      base64ToBytes(data.identity.publicKeySpkiB64),
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      [],
    );
    const privateKey = await crypto.subtle.importKey(
      'jwk',
      data.identity.privateKeyJwk,
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      ['deriveBits'],
    );
    return { publicKey, privateKey };
  }

  /** The signed Pre-Key pair as usable CryptoKeys (responder-side X3DH). */
  async getPreKeyPair(): Promise<{ id: number; publicKey: CryptoKey; privateKey: CryptoKey }> {
    const data = await this.getIdentityData();
    const publicKey = await crypto.subtle.importKey(
      'spki',
      base64ToBytes(data.signedPreKey.publicKeySpkiB64),
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      [],
    );
    const privateKey = await crypto.subtle.importKey(
      'jwk',
      data.signedPreKey.privateKeyJwk,
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      ['deriveBits'],
    );
    return { id: data.signedPreKey.id, publicKey, privateKey };
  }

  /** The signing key pair (ECDSA) as usable CryptoKeys. */
  /** Whether this vault carries an ML-KEM key for the hybrid PQ handshake. */
  hasPqKem(): boolean {
    return this.unlockedData?.pqKem !== undefined;
  }

  /** The vault's ML-KEM-768 public key (base64). Throws if absent or sealed. */
  getPqKemPublicB64(): string {
    if (!this.unlockedData?.pqKem) throw new SealedVaultError();
    return this.unlockedData.pqKem.publicKeyB64;
  }

  /** ML-KEM-768 decapsulation for the responder side of the hybrid handshake (ADR-0006). */
  async decapsulatePq(cipherText: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
    if (!this.unlockedData?.pqKem) throw new SealedVaultError();
    const secretKey = base64ToBytes(this.unlockedData.pqKem.secretKeyB64);
    const shared = ml_kem768.decapsulate(cipherText, secretKey);
    const out = new Uint8Array(new ArrayBuffer(shared.length));
    out.set(shared);
    return out;
  }

  async getSigningKeyPair(): Promise<{ publicKey: CryptoKey; privateKey: CryptoKey }> {
    const data = await this.getIdentityData();
    const publicKey = await crypto.subtle.importKey(
      'spki',
      base64ToBytes(data.signing.publicKeySpkiB64),
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['verify'],
    );
    const privateKey = await crypto.subtle.importKey(
      'jwk',
      data.signing.privateKeyJwk,
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign'],
    );
    return { publicKey, privateKey };
  }

  /** Destroy the stored identity entirely (local data only). */
  async destroy(): Promise<void> {
    await this.store.delete(VAULT_RECORD_KEY);
    this.record = null;
    this.unlockedData = null;
  }
}
