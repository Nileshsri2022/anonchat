// Process-wide DirectMessageClient over the Identity Vault (ADR-0004/0005).

import { DirectMessageClient } from './dm-service';
import { getOrCreateVault } from './vault-instance';

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
