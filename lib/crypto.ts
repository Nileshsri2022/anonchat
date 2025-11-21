// X3DH Handshake & Double Ratchet Encryption Implementation
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

export interface X3DHSession {
  sharedSecret: ArrayBuffer;
  sessionId: string;
}

export interface DoubleRatchetState {
  rootKey: ArrayBuffer;
  sendingChainKey: ArrayBuffer;
  receivingChainKey: ArrayBuffer;
  messageNumber: number;
}

// Generate ECDSA P-256 identity keys for long-term use
export async function generateIdentityKeys(): Promise<IdentityKeys> {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: 'ECDSA',
      namedCurve: 'P-256'
    },
    true,
    ['sign', 'verify']
  );
  return { publicKey: keyPair.publicKey, privateKey: keyPair.privateKey };
}

// Generate ephemeral ECDH P-256 keys for DH
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

// Perform X3DH handshake
export async function performX3DH(
  identityKeys: IdentityKeys,
  preKeys: PreKeys,
  remoteIdentityPublic: CryptoKey,
  remoteEphemeralPublic: CryptoKey
): Promise<X3DHSession> {
  // DH1: Identity key with remote ephemeral
  const dh1 = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: remoteEphemeralPublic },
    identityKeys.privateKey,
    256
  );

  // DH2: Ephemeral key with remote identity
  const dh2 = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: remoteIdentityPublic },
    preKeys.privateKey,
    256
  );

  // DH3: Pre-key with remote ephemeral
  const dh3 = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: remoteEphemeralPublic },
    preKeys.privateKey,
    256
  );

  // KDF to combine DH outputs
  const combined = new Uint8Array([
    ...new Uint8Array(dh1),
    ...new Uint8Array(dh2),
    ...new Uint8Array(dh3),
  ]);

  const sharedSecret = await crypto.subtle.digest('SHA-256', combined);
  const sessionId = generateSessionId();

  return { sharedSecret, sessionId };
}

// Initialize Double Ratchet state
export async function initializeDoubleRatchet(
  sharedSecret: ArrayBuffer
): Promise<DoubleRatchetState> {
  const rootKey = await crypto.subtle.digest('SHA-256', sharedSecret);

  return {
    rootKey,
    sendingChainKey: new ArrayBuffer(32),
    receivingChainKey: new ArrayBuffer(32),
    messageNumber: 0,
  };
}

// KDF-Chain for Double Ratchet
export async function kdfChain(
  chainKey: ArrayBuffer,
  salt: Uint8Array = new Uint8Array(32)
): Promise<{ messageKey: ArrayBuffer; nextChainKey: ArrayBuffer }> {
  const combined = new Uint8Array([
    ...new Uint8Array(chainKey),
    ...salt,
  ]);

  const hkdf = await crypto.subtle.digest('SHA-256', combined);
  const messageKey = hkdf.slice(0, 32);
  const nextChainKey = hkdf.slice(32);

  return { messageKey: messageKey, nextChainKey };
}

// Encrypt message with AES-256-GCM
export async function encryptMessage(
  plaintext: string,
  messageKey: ArrayBuffer
): Promise<{ ciphertext: string; iv: string; tag: string }> {
  const key = await crypto.subtle.importKey(
    'raw',
    messageKey,
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoder = new TextEncoder();
  const plaintextBytes = encoder.encode(plaintext);

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    plaintextBytes
  );

  return {
    ciphertext: btoa(String.fromCharCode(...new Uint8Array(encrypted.slice(0, -16)))),
    iv: btoa(String.fromCharCode(...iv)),
    tag: btoa(String.fromCharCode(...new Uint8Array(encrypted.slice(-16)))),
  };
}

// Decrypt message
export async function decryptMessage(
  ciphertext: string,
  iv: string,
  tag: string,
  messageKey: ArrayBuffer
): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    messageKey,
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );

  const ciphertextBytes = Uint8Array.from(atob(ciphertext), (c) => c.charCodeAt(0));
  const ivBytes = Uint8Array.from(atob(iv), (c) => c.charCodeAt(0));
  const tagBytes = Uint8Array.from(atob(tag), (c) => c.charCodeAt(0));

  const combined = new Uint8Array([...ciphertextBytes, ...tagBytes]);

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: ivBytes },
    key,
    combined
  );

  const decoder = new TextDecoder();
  return decoder.decode(decrypted);
}

// Export CryptoKey to base64 string for QR encoding
export async function exportKeyToBase64(key: CryptoKey): Promise<string> {
  const exported = await crypto.subtle.exportKey('spki', key);
  return btoa(String.fromCharCode(...new Uint8Array(exported)));
}

// Import base64 string back to CryptoKey
export async function importKeyFromBase64(
  base64: string,
  keyType: 'public' | 'private',
  algorithm: 'ECDSA' | 'ECDH'
): Promise<CryptoKey> {
  const keyData = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));

  const keyUsages: KeyUsage[] = keyType === 'public'
    ? (algorithm === 'ECDSA' ? ['verify'] : ['deriveBits'])
    : (algorithm === 'ECDSA' ? ['sign'] : ['deriveBits']);

  const format = keyType === 'public' ? 'spki' : 'pkcs8';

  return crypto.subtle.importKey(
    format,
    keyData,
    algorithm === 'ECDSA'
      ? { name: 'ECDSA', namedCurve: 'P-256' }
      : { name: 'ECDH', namedCurve: 'P-256' },
    true,
    keyUsages
  );
}

// Helper: Generate session ID
function generateSessionId(): string {
  return 'sess_' + Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
