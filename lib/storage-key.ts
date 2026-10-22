// At-rest encryption for local history (ADR-0004): a random storage key encrypts
// every stored message body. The key lives beside the data — sealing it with the
// Profile Passphrase (same PBKDF2 scheme as the Identity Vault) is what makes a
// sealed vault actually protect history.

import type { KVStore } from './kv-store';

const STORAGE_KEY_RECORD = 'storage-key';
const AAD = 'anonchat-storage-key-v1';
export const DEFAULT_PBKDF2_ITERATIONS = 310_000;

interface StoredKeyRecord {
  version: 1;
  /** Present when unsealed: the raw base64 AES key. */
  rawB64?: string;
  /** Present when sealed: iv||ciphertext of the raw key under the passphrase-derived key. */
  ciphertextB64?: string;
  saltB64?: string;
  iterations?: number;
}

function bytesToB64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const raw = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function deriveWrappingKey(passphrase: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export class StorageKeyManager {
  private kv: KVStore;
  private iterations: number;

  constructor(kv: KVStore, iterations?: number) {
    this.kv = kv;
    this.iterations = iterations ?? DEFAULT_PBKDF2_ITERATIONS;
  }

  /** The unsealed-or-unlocked storage key; generates and persists one on first use. */
  async getOrCreate(passphrase?: string): Promise<CryptoKey> {
    const record = (await this.kv.get(STORAGE_KEY_RECORD)) as StoredKeyRecord | undefined;
    if (record?.rawB64) return this.importRaw(record.rawB64);
    if (record?.ciphertextB64 && record.saltB64) {
      if (!passphrase) throw new Error('Storage key is sealed; unlock with the Profile Passphrase');
      return this.unlockRecord(record, passphrase);
    }
    const raw = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(32)));
    await this.kv.set(STORAGE_KEY_RECORD, {
      version: 1,
      rawB64: bytesToB64(raw),
    } satisfies StoredKeyRecord);
    return this.importRaw(bytesToB64(raw));
  }

  /** Seal the storage key under the Profile Passphrase (used at Settings → Seal). */
  async seal(passphrase: string): Promise<void> {
    const record = (await this.kv.get(STORAGE_KEY_RECORD)) as StoredKeyRecord | undefined;
    if (!record?.rawB64) throw new Error('No unsealed storage key to seal');
    const salt = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(16)));
    const wrappingKey = await deriveWrappingKey(passphrase, salt, this.iterations);
    const iv = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(12)));
    const plaintext = b64ToBytes(record.rawB64);
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(AAD) },
      wrappingKey,
      plaintext,
    );
    const blob = new Uint8Array(new ArrayBuffer(12 + ciphertext.byteLength));
    blob.set(iv, 0);
    blob.set(new Uint8Array(ciphertext), 12);
    await this.kv.set(STORAGE_KEY_RECORD, {
      version: 1,
      ciphertextB64: bytesToB64(blob),
      saltB64: bytesToB64(salt),
      iterations: this.iterations,
    } satisfies StoredKeyRecord);
  }

  /** Remove the seal: after unlocking, the key is stored raw again (caveat mode). */
  async removeSeal(passphrase: string): Promise<void> {
    const key = await this.getOrCreate(passphrase);
    const raw = await crypto.subtle.exportKey('raw', key);
    await this.kv.set(STORAGE_KEY_RECORD, { version: 1, rawB64: bytesToB64(new Uint8Array(raw)) });
  }

  private async unlockRecord(record: StoredKeyRecord, passphrase: string): Promise<CryptoKey> {
    const salt = b64ToBytes(record.saltB64!);
    const wrappingKey = await deriveWrappingKey(passphrase, salt, record.iterations ?? this.iterations);
    const blob = b64ToBytes(record.ciphertextB64!);
    try {
      const plaintext = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: blob.slice(0, 12), additionalData: new TextEncoder().encode(AAD) },
        wrappingKey,
        blob.slice(12),
      );
      return this.importRaw(bytesToB64(new Uint8Array(plaintext)));
    } catch {
      throw new Error('Wrong Profile Passphrase for storage key');
    }
  }

  private async importRaw(rawB64: string): Promise<CryptoKey> {
    return crypto.subtle.importKey('raw', b64ToBytes(rawB64), { name: 'AES-GCM', length: 256 }, true, [
      'encrypt',
      'decrypt',
    ]);
  }
}
