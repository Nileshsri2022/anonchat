import { webcrypto } from 'crypto';

const crypto = globalThis.crypto || webcrypto;

export interface DoubleRatchetMessage {
  dhPublic: ArrayBuffer;
  pn: number; // Previous chain length
  n: number;  // Message number in current chain
  ciphertext: ArrayBuffer;
  ad: string; // Associated data
}

export interface DoubleRatchetState {
  dh: CryptoKeyPair;
  rootKey: ArrayBuffer;
  sendChainKey: ArrayBuffer;
  recvChainKey: ArrayBuffer;
  sendMessageNumber: number;
  recvMessageNumber: number;
  previousChainLength: number;
}

/**
 * Double Ratchet Algorithm
 * Provides forward secrecy and break-in recovery
 */
export class DoubleRatchetAlgorithm {
  /**
   * Initialize ratchet from X3DH shared secret
   */
  static async initializeState(sharedSecret: ArrayBuffer): Promise<DoubleRatchetState> {
    const dh = await this.generateDHKeyPair();
    const rootKey = await this.kdfRoot(new ArrayBuffer(32), sharedSecret);

    return {
      dh,
      rootKey,
      sendChainKey: rootKey,
      recvChainKey: rootKey,
      sendMessageNumber: 0,
      recvMessageNumber: 0,
      previousChainLength: 0,
    };
  }

  /**
   * Ratchet step for sending: advance chain key and derive message key
   */
  static async ratchetSend(state: DoubleRatchetState): Promise<ArrayBuffer> {
    const { chainKey, messageKey } = await this.kdfChain(state.sendChainKey);
    state.sendChainKey = chainKey;
    state.sendMessageNumber++;
    return messageKey;
  }

  /**
   * Ratchet step for receiving: advance chain key and derive message key
   */
  static async ratchetRecv(state: DoubleRatchetState): Promise<ArrayBuffer> {
    const { chainKey, messageKey } = await this.kdfChain(state.recvChainKey);
    state.recvChainKey = chainKey;
    state.recvMessageNumber++;
    return messageKey;
  }

  /**
   * DH Ratchet step: generate new DH keypair
   */
  static async dhRatchetSend(state: DoubleRatchetState, remotePublicKey: ArrayBuffer): Promise<void> {
    state.previousChainLength = state.sendMessageNumber;
    state.sendMessageNumber = 0;

    const dh = await this.performDH(state.dh.privateKey, remotePublicKey);
    state.rootKey = await this.kdfRoot(state.rootKey, dh);
    
    state.dh = await this.generateDHKeyPair();
    state.sendChainKey = state.rootKey;
  }

  /**
   * KDF-Root: Root key update
   */
  private static async kdfRoot(rootKey: ArrayBuffer, dhOut: ArrayBuffer): Promise<ArrayBuffer> {
    const hmacKey = await crypto.subtle.importKey(
      'raw',
      rootKey,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    return crypto.subtle.sign('HMAC', hmacKey, dhOut);
  }

  /**
   * KDF-Chain: Message key derivation
   */
  private static async kdfChain(chainKey: ArrayBuffer): Promise<{
    chainKey: ArrayBuffer;
    messageKey: ArrayBuffer;
  }> {
    const hmacKey = await crypto.subtle.importKey(
      'raw',
      chainKey,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    // Message key derivation
    const messageKeyBytes = new Uint8Array(1);
    messageKeyBytes[0] = 0x01;
    const messageKey = await crypto.subtle.sign('HMAC', hmacKey, messageKeyBytes);

    // Chain key advancement
    const chainKeyBytes = new Uint8Array(1);
    chainKeyBytes[0] = 0x02;
    const nextChainKey = await crypto.subtle.sign('HMAC', hmacKey, chainKeyBytes);

    return { chainKey: nextChainKey, messageKey };
  }

  /**
   * Perform DH using X25519
   */
  private static async performDH(
    privateKey: CryptoKey,
    publicKeyData: ArrayBuffer
  ): Promise<ArrayBuffer> {
    const publicKey = await crypto.subtle.importKey(
      'raw',
      publicKeyData,
      { name: 'ECDH', namedCurve: 'X25519' },
      false,
      []
    );

    return crypto.subtle.deriveBits(
      { name: 'ECDH', public: publicKey },
      privateKey,
      256
    );
  }

  /**
   * Generate X25519 keypair
   */
  private static async generateDHKeyPair(): Promise<CryptoKeyPair> {
    return crypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: 'X25519' },
      true,
      ['deriveBits']
    );
  }
}
