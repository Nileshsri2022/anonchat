// Process-wide Identity Vault singleton over IndexedDB.
// The vault is the single source of the user's long-term identity (ADR-0004).

import { IdentityVault } from './identity-vault';
import { IndexedDBKVStore } from './kv-store';

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
