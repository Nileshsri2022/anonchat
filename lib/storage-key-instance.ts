// Process-wide StorageKeyManager + encrypted history storage over IndexedDB (ADR-0004).

import { IndexedDBKVStore } from './kv-store';
import { StorageKeyManager } from './storage-key';
import { createEncryptedStorage, type EncryptedStorage } from './message-storage';

let managerPromise: Promise<StorageKeyManager> | null = null;
let storagePromise: Promise<EncryptedStorage | null> | null = null;

export function getStorageKeyManager(): Promise<StorageKeyManager> {
  if (!managerPromise) {
    managerPromise = (async () => {
      const kv = new IndexedDBKVStore();
      return new StorageKeyManager(kv);
    })();
  }
  return managerPromise;
}

/**
 * The encrypted history storage for this session, or null while the storage key
 * is sealed and locked (history is inaccessible by design until unlocked).
 */
export function getEncryptedHistoryStorage(): Promise<EncryptedStorage | null> {
  if (!storagePromise) {
    storagePromise = (async () => {
      try {
        const manager = await getStorageKeyManager();
        const key = await manager.getOrCreate();
        const kv = new IndexedDBKVStore();
        return createEncryptedStorage(kv, key);
      } catch {
        return null; // sealed and locked — no local history this session
      }
    })();
  }
  return storagePromise;
}

/** Called after seal/unlock/remove so the next session rebuilds storage state. */
export function resetHistoryStorage(): void {
  storagePromise = null;
}
