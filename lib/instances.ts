// ============================================================================
// Process-wide singletons (ADR-0012) — ONE module, four accessors.
//
// Every long-lived object with identity lives here: the Identity Vault, the
// StorageKeyManager + encrypted history storage, the DirectMessageClient, and
// the relay-side RelayCore. Lazily created, memoized for the process lifetime;
// the vault/storage/client pair survive dev HMR semantics via their promises,
// RelayCore additionally pins itself on globalThis (route modules re-import).
// ============================================================================

import { DirectMessageClient } from './dm-service';
import { IdentityVault } from './identity-vault';
import { IndexedDBKVStore } from './kv-store';
import { RelayCore } from './relay-core';
import { StorageKeyManager } from './storage-key';
import { createEncryptedStorage, type EncryptedStorage } from './message-storage';

// ---------------------------------------------------------------------------
// Identity Vault (the single source of the user's long-term identity, ADR-0004)
// ---------------------------------------------------------------------------
let vaultPromise: Promise<IdentityVault> | null = null;

/**
 * Loads the persisted Identity Vault, creating one on first launch.
 * Resolves to a sealed-but-locked vault when a Profile Passphrase is set;
 * callers must unlock() before touching identity material.
 */
export function getOrCreateVault(): Promise<IdentityVault> {
  if (!vaultPromise) {
    vaultPromise = (async () => {
      const store = new IndexedDBKVStore();
      const existing = await IdentityVault.load({ store });
      if (existing) return existing;
      return IdentityVault.create({ store });
    })();
  }
  return vaultPromise;
}

// ---------------------------------------------------------------------------
// StorageKeyManager + encrypted history storage over IndexedDB (ADR-0004)
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// DirectMessageClient over the Identity Vault (ADR-0004/0005)
// ---------------------------------------------------------------------------
let clientPromise: Promise<DirectMessageClient> | null = null;

export function getDmClient(): Promise<DirectMessageClient> {
  if (!clientPromise) {
    clientPromise = (async () => {
      const vault = await getOrCreateVault();
      const userId =
        typeof window !== 'undefined'
          ? localStorage.getItem('anonchat_userid') || `user_${Math.random().toString(36).slice(2, 11)}`
          : 'user_default';
      if (typeof window !== 'undefined') {
        localStorage.setItem('anonchat_userid', userId);
      }
      return new DirectMessageClient({ selfUserId: userId, vault });
    })();
  }
  return clientPromise;
}

// ---------------------------------------------------------------------------
// RelayCore — server-side relay state, pinned on globalThis (survives HMR)
// ---------------------------------------------------------------------------
declare global {
  var globalRelayCore: RelayCore | undefined;
}

export const relayCore: RelayCore =
  globalThis.globalRelayCore ||
  (globalThis.globalRelayCore = new RelayCore({
    payloadCapBytes: 64 * 1024,
    sendRatePerSec: 10,
    burstSize: 25,
    pollRatePerSec: 60,
    joinRatePerSec: 5,
  }));

// Periodic sweep of expired messages and stale replay windows.
if (typeof setInterval === 'function') {
  const g = globalThis as unknown as { __relaySweepTimer?: ReturnType<typeof setInterval> };
  if (!g.__relaySweepTimer) {
    g.__relaySweepTimer = setInterval(() => {
      relayCore.sweepExpired();
    }, 10_000);
  }
}
