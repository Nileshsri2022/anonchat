// Key-generation utilities used by tests and tooling.
//
// The live X3DH + Double Ratchet implementation lives in
// `./direct-message-session`. The historical duplicate session-cipher code
// (performX3DH / initializeDoubleRatchet / kdfChain / encryptMessage /
// decryptMessage) was removed — its kdfChain derived nextChainKey from
// `digest.slice(32)`, which is always zero-length for SHA-256.
import { webcrypto } from 'crypto';

const crypto = globalThis.crypto || webcrypto;

export interface IdentityKeys {
  publicKey: CryptoKey;
  privateKey: CryptoKey;
}

export interface PreKeys {
  id: number;
  publicKey: CryptoKey;
  privateKey: CryptoKey;
}

// Generate ECDH P-256 identity keys for long-term use
export async function generateIdentityKeys(): Promise<IdentityKeys> {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: 'ECDH',
      namedCurve: 'P-256'
    },
    true,
    ['deriveBits']
  );
  return { publicKey: keyPair.publicKey, privateKey: keyPair.privateKey };
}

// Generate ephemeral ECDH P-256 keys for a DH step
export async function generateEphemeralKeys(): Promise<IdentityKeys> {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: 'ECDH',
      namedCurve: 'P-256'
    },
    true,
    ['deriveBits']
  );
  return { publicKey: keyPair.publicKey, privateKey: keyPair.privateKey };
}
