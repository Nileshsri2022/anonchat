import { webcrypto } from 'crypto';

const crypto = globalThis.crypto || webcrypto;

export interface X3DHKeyBundle {
  identityKey: CryptoKey;
  signedPreKey: CryptoKey;
  preKeySignature: ArrayBuffer;
  oneTimePreKeys: CryptoKey[];
}

export interface X3DHResult {
  sharedSecret: ArrayBuffer;
  sessionId: string;
  ad: string; // Associated data
}

/**
 * X3DH Handshake Implementation
 * Provides mutual authentication and establishes shared secret
 */
export class X3DHHandshake {
  /**
   * Initiator sends first message with ephemeral key
   */
  static async initiatorStart(
    initiatorIdentity: CryptoKey,
    initiatorEphemeral: CryptoKey,
    recipientIdentity: CryptoKey,
    recipientPreKey: CryptoKey,
    recipientOneTimeKey?: CryptoKey
  ): Promise<X3DHResult> {
    // DH1: initiator identity × recipient prekey
    const dh1 = await this.performDH(initiatorIdentity, recipientPreKey);

    // DH2: initiator ephemeral × recipient identity  
    const dh2 = await this.performDH(initiatorEphemeral, recipientIdentity);

    // DH3: initiator ephemeral × recipient prekey
    const dh3 = await this.performDH(initiatorEphemeral, recipientPreKey);

    // DH4 (if one-time key available): initiator ephemeral × recipient one-time key
    let dh4 = new ArrayBuffer(32);
    if (recipientOneTimeKey) {
      dh4 = await this.performDH(initiatorEphemeral, recipientOneTimeKey);
    }

    // Combine DH results
    const kdfInput = this.concatArrayBuffers(dh1, dh2, dh3, dh4);
    const sharedSecret = await this.kdfRK(new ArrayBuffer(32), kdfInput);

    return {
      sharedSecret,
      sessionId: this.generateSessionId(),
      ad: 'AnonChat X3DH v1',
    };
  }

  /**
   * Responder receives and responds to X3DH
   */
  static async responderStart(
    responderIdentity: CryptoKey,
    responderPreKey: CryptoKey,
    responderOneTimeKey: CryptoKey | null,
    initiatorIdentity: CryptoKey,
    initiatorEphemeral: CryptoKey
  ): Promise<X3DHResult> {
    // Same DH computations but from responder perspective
    const dh1 = await this.performDH(responderPreKey, initiatorIdentity);
    const dh2 = await this.performDH(responderIdentity, initiatorEphemeral);
    const dh3 = await this.performDH(responderPreKey, initiatorEphemeral);

    let dh4 = new ArrayBuffer(32);
    if (responderOneTimeKey) {
      dh4 = await this.performDH(responderOneTimeKey, initiatorEphemeral);
    }

    const kdfInput = this.concatArrayBuffers(dh1, dh2, dh3, dh4);
    const sharedSecret = await this.kdfRK(new ArrayBuffer(32), kdfInput);

    return {
      sharedSecret,
      sessionId: this.generateSessionId(),
      ad: 'AnonChat X3DH v1',
    };
  }

  /**
   * Perform Diffie-Hellman using X25519
   */
  private static async performDH(
    privateKey: CryptoKey,
    publicKey: CryptoKey
  ): Promise<ArrayBuffer> {
    return crypto.subtle.deriveBits(
      { name: 'ECDH', public: publicKey },
      privateKey,
      256
    );
  }

  /**
   * KDF-RK: Root key derivation function
   */
  private static async kdfRK(
    rk: ArrayBuffer,
    input: ArrayBuffer
  ): Promise<ArrayBuffer> {
    const hmacKey = await crypto.subtle.importKey(
      'raw',
      rk,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    return crypto.subtle.sign('HMAC', hmacKey, input);
  }

  /**
   * Concatenate multiple ArrayBuffers
   */
  private static concatArrayBuffers(...buffers: ArrayBuffer[]): ArrayBuffer {
    const totalLength = buffers.reduce((acc, buf) => acc + buf.byteLength, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;

    for (const buf of buffers) {
      result.set(new Uint8Array(buf), offset);
      offset += buf.byteLength;
    }

    return result.buffer;
  }

  /**
   * Generate unique session ID
   */
  private static generateSessionId(): string {
    return 'sess_' + Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }
}
