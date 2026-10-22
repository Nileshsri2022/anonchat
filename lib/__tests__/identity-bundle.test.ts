import { describe, test, expect } from 'bun:test';
import { MemoryKVStore } from '../kv-store';
import { IdentityVault } from '../identity-vault';
import {
  exportIdentityBundle,
  serializeInvite,
  parseInvite,
  deriveSafetyNumber,
  deriveSas,
} from '../identity-bundle';

async function makeVault() {
  return IdentityVault.create({ store: new MemoryKVStore(), iterations: 1000 });
}

describe('IdentityBundle — Ticket 02: Real contact exchange', () => {
  test('exports a bundle from the vault whose Pre-Key signature verifies against the bundle signing key', async () => {
    const vault = await makeVault();
    const bundle = await exportIdentityBundle(vault);

    expect(bundle.identityPublicKeySpkiB64.length).toBeGreaterThan(0);
    expect(bundle.identitySigningPublicKeySpkiB64.length).toBeGreaterThan(0);
    expect(bundle.preKeyPublicSpkiB64.length).toBeGreaterThan(0);
    expect(bundle.preKeySignatureB64.length).toBeGreaterThan(0);
    expect(bundle.preKeyId).toBeGreaterThan(0);

    const crypto = globalThis.crypto;
    const signingPub = await crypto.subtle.importKey(
      'spki',
      Uint8Array.from(atob(bundle.identitySigningPublicKeySpkiB64), (c) => c.charCodeAt(0)),
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['verify'],
    );
    const ok = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      signingPub,
      Uint8Array.from(atob(bundle.preKeySignatureB64), (c) => c.charCodeAt(0)),
      Uint8Array.from(atob(bundle.preKeyPublicSpkiB64), (c) => c.charCodeAt(0)),
    );
    expect(ok).toBe(true);
  });

  test('invite string round-trips through serialize/parse; tampering is rejected', async () => {
    const vault = await makeVault();
    const bundle = await exportIdentityBundle(vault);

    const invite = serializeInvite(bundle);
    expect(invite.startsWith('anonchat-invite-v1:')).toBe(true);

    const parsed = parseInvite(invite);
    expect(parsed.identityPublicKeySpkiB64).toBe(bundle.identityPublicKeySpkiB64);
    expect(parsed.preKeyPublicSpkiB64).toBe(bundle.preKeyPublicSpkiB64);
    expect(parsed.preKeySignatureB64).toBe(bundle.preKeySignatureB64);
    expect(parsed.preKeyId).toBe(bundle.preKeyId);

    // Tamper with the payload → parse must reject
    const raw = atob(invite.slice('anonchat-invite-v1:'.length));
    const flipped = String.fromCharCode(raw.charCodeAt(0) ^ 0x01) + raw.slice(1);
    const tampered = 'anonchat-invite-v1:' + btoa(flipped);
    expect(() => parseInvite(tampered)).toThrow();

    // Garbage → reject
    expect(() => parseInvite('not an invite')).toThrow();
    expect(() => parseInvite('anonchat-invite-v1:eyJub25zZW5zZSI6MQ==')).toThrow();
  });

  test('Safety Number: identical for both orderings of the same pair, different for different pairs', async () => {
    const vaultA = await makeVault();
    const vaultB = await makeVault();
    const vaultC = await makeVault();
    const a = await exportIdentityBundle(vaultA);
    const b = await exportIdentityBundle(vaultB);
    const c = await exportIdentityBundle(vaultC);

    const ab1 = await deriveSafetyNumber(a.identityPublicKeySpkiB64, b.identityPublicKeySpkiB64);
    const ab2 = await deriveSafetyNumber(b.identityPublicKeySpkiB64, a.identityPublicKeySpkiB64);
    expect(ab1).toBe(ab2);

    const ac = await deriveSafetyNumber(a.identityPublicKeySpkiB64, c.identityPublicKeySpkiB64);
    expect(ac).not.toBe(ab1);

    // Formatted for humans: digit groups separated by dashes
    expect(ab1).toMatch(/^\d{5}(-\d{5})*$/);
  });

  test('SAS values are key-derived: stable per pair, never random', async () => {
    const vaultA = await makeVault();
    const vaultB = await makeVault();
    const a = await exportIdentityBundle(vaultA);
    const b = await exportIdentityBundle(vaultB);

    const sas1 = await deriveSas(a.identityPublicKeySpkiB64, b.identityPublicKeySpkiB64);
    const sas2 = await deriveSas(b.identityPublicKeySpkiB64, a.identityPublicKeySpkiB64);
    expect(sas1).toBe(sas2);
    // Called twice → identical (no randomness)
    const sas3 = await deriveSas(a.identityPublicKeySpkiB64, b.identityPublicKeySpkiB64);
    expect(sas3).toBe(sas1);
  });
});
