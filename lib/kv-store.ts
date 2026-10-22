// Key-value persistence seam for local vaults.
// Implementations: MemoryKVStore (tests), IndexedDBKVStore (browser).

export interface KVStore {
  get(key: string): Promise<unknown | undefined>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
}

export class MemoryKVStore implements KVStore {
  private map = new Map<string, unknown>();

  async get(key: string): Promise<unknown | undefined> {
    return this.map.get(key);
  }

  async set(key: string, value: unknown): Promise<void> {
    this.map.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.map.delete(key);
  }
}

const DB_NAME = 'anonchat_vault';
const DB_VERSION = 1;
const STORE_NAME = 'vault';

export class IndexedDBKVStore implements KVStore {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private open(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('IndexedDB not available'));
        return;
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return this.dbPromise;
  }

  private async tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await this.open();
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, mode);
      const request = fn(tx.objectStore(STORE_NAME));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async get(key: string): Promise<unknown | undefined> {
    return this.tx('readonly', (store) => store.get(key));
  }

  async set(key: string, value: unknown): Promise<void> {
    await this.tx('readwrite', (store) => store.put(value, key));
  }

  async delete(key: string): Promise<void> {
    await this.tx('readwrite', (store) => store.delete(key));
  }
}
