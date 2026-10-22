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

}

export const identityService = new IdentityService();
