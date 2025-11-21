import { webcrypto } from 'crypto';

const crypto = globalThis.crypto || webcrypto;

export class IdentityService {
  private fingerprints: Map<string, string> = new Map();

  /**
   * Generate SHA-256 fingerprint from public key
   */
  async generateFingerprint(publicKeyData: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(publicKeyData);
    
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase();

    // Format as readable: XXXX-XXXX-XXXX-XXXX...
    return hashHex.match(/.{1,4}/g)?.join('-') || hashHex;
  }

  /**
   * Store fingerprint for verification
   */
  storeFingerprint(identityId: string, fingerprint: string): void {
    this.fingerprints.set(identityId, fingerprint);
  }

  /**
   * Verify fingerprint matches stored value
   */
  verifyFingerprint(identityId: string, fingerprint: string): boolean {
    const stored = this.fingerprints.get(identityId);
    return stored === fingerprint;
  }

  /**
   * Get stored fingerprint
   */
  getFingerprint(identityId: string): string | undefined {
    return this.fingerprints.get(identityId);
  }

  /**
   * Generate SAS codes for out-of-band verification
   */
  generateSASCodes(identityId1: string, identityId2: string): string[] {
    const combined = identityId1 + identityId2;
    const hash = Array.from(crypto.getRandomValues(new Uint8Array(6)))
      .map(b => (b % 10).toString())
      .join('');

    const code1 = hash.slice(0, 3);
    const code2 = hash.slice(3, 6);

    return [code1, code2];
  }
}

export const identityService = new IdentityService();
