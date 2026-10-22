// IndexedDB message storage for persisting chat messages
// Stores encrypted messages locally per room

const DB_NAME = 'anonchat_messages';
const DB_VERSION = 1;
const STORE_NAME = 'messages';

interface StoredMessage {
    id: string;
    roomId: string;
    userId: string;
    username: string;
    content: string; // Decrypted content
    timestamp: number;
    encrypted: boolean;
    ip?: string;
    expiresAt?: number;
}

class MessageStorage {
    private db: IDBDatabase | null = null;
    private initPromise: Promise<void> | null = null;

    async init(): Promise<void> {
        if (this.db) return;
        if (this.initPromise) return this.initPromise;

        this.initPromise = new Promise((resolve, reject) => {
            if (typeof window === 'undefined') {
                reject(new Error('IndexedDB not available'));
                return;
            }

            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = () => {
                console.error('Failed to open IndexedDB:', request.error);
                reject(request.error);
            };

            request.onsuccess = () => {
                this.db = request.result;
                console.log('📦 IndexedDB initialized');
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;

                // Create messages store with indexes
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                    store.createIndex('roomId', 'roomId', { unique: false });
                    store.createIndex('timestamp', 'timestamp', { unique: false });
                    store.createIndex('expiresAt', 'expiresAt', { unique: false });
                    console.log('📦 Created messages store');
                }
            };
        });

        return this.initPromise;
    }

    async saveMessage(message: StoredMessage): Promise<void> {
        await this.init();
        if (!this.db) throw new Error('DB not initialized');

        return new Promise((resolve, reject) => {
            const tx = this.db!.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const request = store.put(message);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async saveMessages(messages: StoredMessage[]): Promise<void> {
        await this.init();
        if (!this.db) throw new Error('DB not initialized');

        return new Promise((resolve, reject) => {
            const tx = this.db!.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);

            messages.forEach(msg => store.put(msg));

            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    async getMessagesByRoom(roomId: string): Promise<StoredMessage[]> {
        await this.init();
        if (!this.db) throw new Error('DB not initialized');

        return new Promise((resolve, reject) => {
            const tx = this.db!.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const index = store.index('roomId');
            const request = index.getAll(roomId);

            request.onsuccess = () => {
                const messages = request.result as StoredMessage[];
                // Filter out expired messages
                const now = Date.now();
                const validMessages = messages.filter(m => !m.expiresAt || m.expiresAt > now);
                // Sort by timestamp
                validMessages.sort((a, b) => a.timestamp - b.timestamp);
                resolve(validMessages);
            };
            request.onerror = () => reject(request.error);
        });
    }

    async deleteMessage(messageId: string): Promise<void> {
        await this.init();
        if (!this.db) throw new Error('DB not initialized');

        return new Promise((resolve, reject) => {
            const tx = this.db!.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const request = store.delete(messageId);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async deleteExpiredMessages(): Promise<number> {
        await this.init();
        if (!this.db) throw new Error('DB not initialized');

        return new Promise((resolve, reject) => {
            const tx = this.db!.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const index = store.index('expiresAt');
            const now = Date.now();
            let deletedCount = 0;

            // Get all messages with expiresAt
            const request = index.openCursor();

            request.onsuccess = (event) => {
                const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
                if (cursor) {
                    const message = cursor.value as StoredMessage;
                    if (message.expiresAt && message.expiresAt <= now) {
                        cursor.delete();
                        deletedCount++;
                    }
                    cursor.continue();
                }
            };

            tx.oncomplete = () => resolve(deletedCount);
            tx.onerror = () => reject(tx.error);
        });
    }

    async clearRoom(roomId: string): Promise<void> {
        await this.init();
        if (!this.db) throw new Error('DB not initialized');

        return new Promise((resolve, reject) => {
            const tx = this.db!.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const index = store.index('roomId');
            const request = index.openCursor(roomId);

            request.onsuccess = (event) => {
                const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
                if (cursor) {
                    cursor.delete();
                    cursor.continue();
                }
            };

            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    async clearAll(): Promise<void> {
        await this.init();
        if (!this.db) throw new Error('DB not initialized');

        return new Promise((resolve, reject) => {
            const tx = this.db!.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const request = store.clear();

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }
}

export const messageStorage = new MessageStorage();
export type { StoredMessage };

// --- At-rest encryption layer (ADR-0004) -------------------------------------
// When a storage key is provided, message bodies are persisted only as AES-GCM
// ciphertext blobs; loading decrypts transparently. Without a key the store is
// device-local plaintext (caveat mode shown in Settings).

import type { KVStore } from './kv-store';
import type { StoredMessage as StoredMessageType } from './message-storage';

const ENC_PREFIX = 'messages:';
const INDEX_PREFIX = 'room-index:';

export interface EncryptedStorage {
  saveMessage(message: StoredMessageType): Promise<void>;
  getMessagesByRoom(roomId: string): Promise<StoredMessageType[]>;
  deleteMessage(messageId: string): Promise<void>;
  clearRoom(roomId: string): Promise<void>;
  /** Hard-deletes expired disappearing messages from the store. Returns count. */
  purgeExpired(roomId: string): Promise<number>;
}

function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const raw = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function bytesToB64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

/**
 * Builds a storage instance over a KV seam. With `key`, each message is stored as
 * `{ blob: iv||ciphertext }`; the room index holds message ids only. Entries that
 * fail decryption under the current key are not surfaced.
 */
export function createEncryptedStorage(kv: KVStore, key: CryptoKey | null): EncryptedStorage {
  async function encryptBody(message: StoredMessageType): Promise<Record<string, unknown>> {
    if (!key) {
      // Caveat mode: plaintext body, clearly marked
      return { ...message, caveat: 'stored without encryption' };
    }
    const iv = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(12)));
    const plaintext = new TextEncoder().encode(JSON.stringify(message));
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
    const blob = new Uint8Array(new ArrayBuffer(12 + ciphertext.byteLength));
    blob.set(iv, 0);
    blob.set(new Uint8Array(ciphertext), 12);
    return { id: message.id, roomId: message.roomId, blob: bytesToB64(blob), ts: message.timestamp };
  }

  async function decryptBody(record: Record<string, unknown>): Promise<StoredMessageType | null> {
    if (typeof record.blob !== 'string') {
      return record as unknown as StoredMessageType; // caveat-mode record
    }
    if (!key) return null; // sealed content, no key this session
    const blob = b64ToBytes(record.blob);
    try {
      const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: blob.slice(0, 12) }, key, blob.slice(12));
      return JSON.parse(new TextDecoder().decode(plaintext)) as StoredMessageType;
    } catch {
      return null;
    }
  }

  return {
    async saveMessage(message) {
      const record = await encryptBody(message);
      await kv.set(ENC_PREFIX + message.id, record);
      const indexKey = INDEX_PREFIX + message.roomId;
      const index = ((await kv.get(indexKey)) as string[] | undefined) ?? [];
      if (!index.includes(message.id)) index.push(message.id);
      await kv.set(indexKey, index);
    },

    async getMessagesByRoom(roomId) {
      const index = ((await kv.get(INDEX_PREFIX + roomId)) as string[] | undefined) ?? [];
      const out: StoredMessageType[] = [];
      const now = Date.now();
      for (const id of index) {
        const record = (await kv.get(ENC_PREFIX + id)) as Record<string, unknown> | undefined;
        if (!record) continue;
        const message = await decryptBody(record);
        if (message && (!message.expiresAt || message.expiresAt > now)) out.push(message);
      }
      out.sort((a, b) => a.timestamp - b.timestamp);
      return out;
    },

    async deleteMessage(messageId) {
      await kv.delete(ENC_PREFIX + messageId);
    },

    async clearRoom(roomId) {
      const index = ((await kv.get(INDEX_PREFIX + roomId)) as string[] | undefined) ?? [];
      for (const id of index) await kv.delete(ENC_PREFIX + id);
      await kv.delete(INDEX_PREFIX + roomId);
    },

    async purgeExpired(roomId) {
      const index = ((await kv.get(INDEX_PREFIX + roomId)) as string[] | undefined) ?? [];
      const now = Date.now();
      let purged = 0;
      for (const id of index) {
        const record = (await kv.get(ENC_PREFIX + id)) as Record<string, unknown> | undefined;
        if (!record) continue;
        const message = await decryptBody(record);
        if (message && message.expiresAt && message.expiresAt <= now) {
          await kv.delete(ENC_PREFIX + id);
          const next = index.filter((x) => x !== id);
          await kv.set(INDEX_PREFIX + roomId, next);
          index.splice(index.indexOf(id), 1);
          purged++;
        }
      }
      return purged;
    },
  };
}
