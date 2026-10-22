// Identity Bundle: the public key material a Contact publishes so an Initiator
// can open an authenticated DM session (ADR-0005). Travels inside Invites
// (QR or copyable string) — never through the Relay.

import type { IdentityVault } from './identity-vault';

export const INVITE_PREFIX = 'anonchat-invite-v1:';

export interface IdentityBundle {
  /** v2 adds the ML-KEM-768 PQ key + its signature (ADR-0006); v1 remains valid. */
  version: 1 | 2;
  identityPublicKeySpkiB64: string;
  identitySigningPublicKeySpkiB64: string;
  preKeyPublicSpkiB64: string;
  preKeySignatureB64: string;
  preKeyId: number;
  /** ML-KEM-768 public key (base64) — present iff version 2. */
  pqKemPublicB64?: string;
  /** ECDSA-P256-SHA-256 signature over the PQ key bytes (base64) — present iff version 2. */
  pqKemSignatureB64?: string;
  createdAt: number;
}

const PQ_SIGNATURE_DOMAIN = 'anonchat-pqkem-v1|';

function bytesToB64(bytes: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)));
}

function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const raw = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** Exports the vault's public Identity Bundle (vault must be unlocked). */
export async function exportIdentityBundle(vault: IdentityVault): Promise<IdentityBundle> {
  const data = await vault.getIdentityData();
  const base: IdentityBundle = {
    version: 1,
    identityPublicKeySpkiB64: data.identity.publicKeySpkiB64,
    identitySigningPublicKeySpkiB64: data.signing.publicKeySpkiB64,
    preKeyPublicSpkiB64: data.signedPreKey.publicKeySpkiB64,
    preKeySignatureB64: data.signedPreKey.signatureB64,
    preKeyId: data.signedPreKey.id,
    createdAt: data.createdAt,
  };
  if (!vault.hasPqKem()) return base;

  const pqPublicB64 = vault.getPqKemPublicB64();
  const signing = await vault.getSigningKeyPair();
  const signed = new Uint8Array([...new TextEncoder().encode(PQ_SIGNATURE_DOMAIN), ...b64ToBytes(pqPublicB64)]);
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, signing.privateKey, signed);
  return {
    ...base,
    version: 2,
    pqKemPublicB64: pqPublicB64,
    pqKemSignatureB64: bytesToB64(signature),
  };
}

/** Serialises a bundle into a copyable Invite string. */
export function serializeInvite(bundle: IdentityBundle): string {
  return INVITE_PREFIX + btoa(JSON.stringify(bundle));
}

/**
 * Parses and structurally validates an Invite string.
 * Throws on wrong prefix, malformed JSON, or missing/ill-typed fields.
 * (Cryptographic validation — the Pre-Key signature — happens in validateBundle.)
 */
export function parseInvite(invite: string): IdentityBundle {
  const trimmed = invite.trim();
  if (!trimmed.startsWith(INVITE_PREFIX)) {
    throw new Error('Not an AnonChat Invite (missing prefix)');
  }
  let json: unknown;
  try {
    json = JSON.parse(atob(trimmed.slice(INVITE_PREFIX.length)));
  } catch {
    throw new Error('Invite payload is not valid');
  }
  const b = json as Partial<IdentityBundle>;
  const isB64 = (v: unknown) => typeof v === 'string' && v.length > 0 && /^[A-Za-z0-9+/=]+$/.test(v);
  const pqFieldsOk =
    (b.pqKemPublicB64 === undefined && b.pqKemSignatureB64 === undefined) ||
    (isB64(b.pqKemPublicB64) && isB64(b.pqKemSignatureB64));
  if (
    (b.version !== 1 && b.version !== 2) ||
    !isB64(b.identityPublicKeySpkiB64) ||
    !isB64(b.identitySigningPublicKeySpkiB64) ||
    !isB64(b.preKeyPublicSpkiB64) ||
    !isB64(b.preKeySignatureB64) ||
    typeof b.preKeyId !== 'number' ||
    typeof b.createdAt !== 'number' ||
    !pqFieldsOk
  ) {
    throw new Error('Invite payload is missing or has invalid Identity Bundle fields');
  }
  return b as IdentityBundle;
}

/** Verifies the bundle's Pre-Key signature under its signing key. Throws when it fails. */
export async function validateBundle(bundle: IdentityBundle): Promise<void> {
  const crypto = globalThis.crypto;
  const signingPub = await crypto.subtle.importKey(
    'spki',
    b64ToBytes(bundle.identitySigningPublicKeySpkiB64),
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['verify'],
  );
  const ok = await crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    signingPub,
    b64ToBytes(bundle.preKeySignatureB64),
    b64ToBytes(bundle.preKeyPublicSpkiB64),
  );
  if (!ok) {
    throw new Error('Identity Bundle signature verification failed');
  }

  if (Boolean(bundle.pqKemPublicB64) !== Boolean(bundle.pqKemSignatureB64)) {
    throw new Error('Identity Bundle PQ key and signature must be present together');
  }
  if (bundle.pqKemPublicB64 && bundle.pqKemSignatureB64) {
    const pqSigned = new Uint8Array([
      ...new TextEncoder().encode(PQ_SIGNATURE_DOMAIN),
      ...b64ToBytes(bundle.pqKemPublicB64),
    ]);
    const pqOk = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      signingPub,
      b64ToBytes(bundle.pqKemSignatureB64),
      pqSigned,
    );
    if (!pqOk) {
      throw new Error('Identity Bundle PQ key signature verification failed');
    }
  }
}

async function pairHash(a: string, b: string, domain: string): Promise<Uint8Array<ArrayBuffer>> {
  const sorted = [a.trim(), b.trim()].sort();
  const data = new TextEncoder().encode(`${domain}|${sorted[0]}|${sorted[1]}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const out = new Uint8Array(new ArrayBuffer(digest.byteLength));
  out.set(new Uint8Array(digest));
  return out;
}

/**
 * Safety Number derived from both peers' identity public keys.
 * Deterministic: both peers derive the identical value regardless of argument order.
 * Formatted as six dash-separated 5-digit groups for out-of-band comparison.
 */
export async function deriveSafetyNumber(identityPubA: string, identityPubB: string): Promise<string> {
  const digest = await pairHash(identityPubA, identityPubB, 'anonchat-safety-v1');
  // 60 decimal digits from the digest (enough entropy; truncated deterministically)
  let digits = '';
  for (const byte of digest) digits += (byte % 100).toString().padStart(2, '0');
  const thirtyGroups: string[] = [];
  for (let i = 0; i < 6; i++) {
    thirtyGroups.push(digits.slice(i * 5, i * 5 + 5));
  }
  return thirtyGroups.join('-');
}

/**
 * Short Authentication String derived from both identity keys (never random).
 * Six digits, stable per pair — used as the verification challenge.
 */
export async function deriveSas(identityPubA: string, identityPubB: string): Promise<string> {
  const digest = await pairHash(identityPubA, identityPubB, 'anonchat-sas-v1');
  let digits = '';
  for (let i = 0; i < 3; i++) digits += (digest[i] % 100).toString().padStart(2, '0');
  return digits.slice(0, 6);
}
