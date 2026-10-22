import { webcrypto } from 'crypto';
import type { Contact } from './contact-manager';
import type { IdentityKeys, PreKeys } from './crypto';

const crypto = globalThis.crypto || webcrypto;

export interface MessageEnvelope {
  version: number;
  channelId: string;
  senderId: string;
  senderIdentityPublic: string; // base64 SPKI or JWK
  header: {
    dhPublic: string; // base64 SPKI
    n: number;
    pn: number;
  };
  ciphertext: string; // base64
  iv: string; // base64
  tag: string; // base64
  ttl?: number;
  expiresAt?: number;
  timestamp: number;
}

export interface DecryptedMessage {
  id: string;
  channelId: string;
  senderId: string;
  content: string;
  timestamp: number;
  ttl?: number;
  expiresAt?: number;
}

export interface DirectMessageSessionConfig {
  selfUserId: string;
  selfIdentityKeys: IdentityKeys;
  selfPreKeys?: PreKeys;
}

/**
 * Derives a deterministic Pairwise Channel ID from two public keys.
 * Sorts public keys lexicographically so both peers derive the exact same channel ID.
 */
export async function derivePairwiseChannelId(pkA: string, pkB: string): Promise<string> {
  const sorted = [pkA.trim(), pkB.trim()].sort();
  const combined = new TextEncoder().encode(sorted.join(':::'));
  const hash = await crypto.subtle.digest('SHA-256', combined);
  const hex = Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `dm_${hex}`;
}

export class DirectMessageSession {
  private selfUserId: string;
  private selfIdentityKeys: IdentityKeys;
  private selfPreKeys?: PreKeys;
  private recipientContact?: Contact;

  private channelId?: string;
  private rootKey?: ArrayBuffer;
  private sendChainKey?: ArrayBuffer;
  private recvChainKey?: ArrayBuffer;
  private sendDH?: CryptoKeyPair;
  private remoteDHPublic?: CryptoKey;
  private remoteDHPublicRaw?: string;

  private sendMessageNumber = 0;
  private recvMessageNumber = 0;
  private previousChainLength = 0;

  // Skipped-key cache for out-of-order message delivery (max 1000 keys)
  private skippedKeys = new Map<string, ArrayBuffer>();
  private readonly MAX_SKIPPED_KEYS = 1000;

  private history: DecryptedMessage[] = [];

  constructor(config: DirectMessageSessionConfig) {
    this.selfUserId = config.selfUserId;
    this.selfIdentityKeys = config.selfIdentityKeys;
    this.selfPreKeys = config.selfPreKeys;
  }

  getChannelId(): string | undefined {
    return this.channelId;
  }

  getHistory(): DecryptedMessage[] {
    return [...this.history];
  }

  isVerified(): boolean {
    return Boolean(this.recipientContact?.verified);
  }

  getSafetyNumber(): string {
    return this.recipientContact?.identity.fingerprint || 'UNVERIFIED';
  }

  /**
   * Alice (initiator) starts session to Bob
   */
  async initiate(recipientContact: Contact): Promise<void> {
    this.recipientContact = recipientContact;

    const selfIdPublicStr = await this.exportKeyToString(this.selfIdentityKeys.publicKey);
    this.channelId = await derivePairwiseChannelId(selfIdPublicStr, recipientContact.identity.identityPublicKey);

    const remoteIdentityKey = await this.importKeyFromString(recipientContact.identity.identityPublicKey, 'public');
    const remotePreKey = await this.importKeyFromString(recipientContact.identity.preKeyPublic, 'public');

    // Generate Alice's initial DH keypair
    this.sendDH = await crypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      ['deriveBits']
    );

    // X3DH calculation using sendDH:
    const dh1 = await crypto.subtle.deriveBits(
      { name: 'ECDH', public: remotePreKey },
      this.selfIdentityKeys.privateKey,
      256
    );
    const dh2 = await crypto.subtle.deriveBits(
      { name: 'ECDH', public: remoteIdentityKey },
      this.sendDH.privateKey,
      256
    );
    const dh3 = await crypto.subtle.deriveBits(
      { name: 'ECDH', public: remotePreKey },
      this.sendDH.privateKey,
      256
    );

    const combinedDH = new Uint8Array([
      ...new Uint8Array(dh1),
      ...new Uint8Array(dh2),
      ...new Uint8Array(dh3),
    ]);
    const masterSharedSecret = await crypto.subtle.digest('SHA-256', combinedDH);

    this.rootKey = masterSharedSecret;
    this.sendChainKey = masterSharedSecret;
    this.remoteDHPublic = remotePreKey;
    this.remoteDHPublicRaw = recipientContact.identity.preKeyPublic;
    this.sendMessageNumber = 0;
    this.recvMessageNumber = 0;
  }

  /**
   * Bob receives envelope and completes X3DH if not already initialized
   */
  private async ensureResponderInitialized(envelope: MessageEnvelope): Promise<void> {
    if (this.rootKey) return; // Already initialized

    if (!this.selfPreKeys) {
      throw new Error('Cannot initialize responder session without pre-keys');
    }

    const remoteIdentityKey = await this.importKeyFromString(envelope.senderIdentityPublic, 'public');
    const remoteDH = await this.importKeyFromString(envelope.header.dhPublic, 'public');

    // Bob X3DH:
    const dh1 = await crypto.subtle.deriveBits(
      { name: 'ECDH', public: remoteIdentityKey },
      this.selfPreKeys.privateKey,
      256
    );
    const dh2 = await crypto.subtle.deriveBits(
      { name: 'ECDH', public: remoteDH },
      this.selfIdentityKeys.privateKey,
      256
    );
    const dh3 = await crypto.subtle.deriveBits(
      { name: 'ECDH', public: remoteDH },
      this.selfPreKeys.privateKey,
      256
    );

    const combinedDH = new Uint8Array([
      ...new Uint8Array(dh1),
      ...new Uint8Array(dh2),
      ...new Uint8Array(dh3),
    ]);
    const masterSharedSecret = await crypto.subtle.digest('SHA-256', combinedDH);

    this.rootKey = masterSharedSecret;
    this.recvChainKey = masterSharedSecret;
    this.remoteDHPublic = remoteDH;
    this.remoteDHPublicRaw = envelope.header.dhPublic;

    // Bob generates a new DH keypair for sending replies
    this.sendDH = await crypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      ['deriveBits']
    );

    // Derive Bob's sending chain: DH(Bob's sendDH.private, Alice's remoteDH.public)
    const dhSend = await crypto.subtle.deriveBits(
      { name: 'ECDH', public: remoteDH },
      this.sendDH.privateKey,
      256
    );
    const { rootKey: nextRoot, chainKey: sendChain } = await this.kdfRK(this.rootKey, dhSend);
    this.rootKey = nextRoot;
    this.sendChainKey = sendChain;

    const selfPublicStr = await this.exportKeyToString(this.selfIdentityKeys.publicKey);
    this.channelId = envelope.channelId || (await derivePairwiseChannelId(selfPublicStr, envelope.senderIdentityPublic));
  }

  /**
   * Send a Direct Message
   */
  async sendMessage(content: string, options?: { ttl?: number }): Promise<MessageEnvelope> {
    if (!this.sendChainKey || !this.sendDH || !this.channelId) {
      throw new Error('DirectMessageSession not initialized. Call initiate() first.');
    }

    // Advance symmetric sending chain
    const { nextChainKey, messageKey } = await this.kdfChain(this.sendChainKey);
    this.sendChainKey = nextChainKey;

    const currentMsgNumber = this.sendMessageNumber;
    this.sendMessageNumber++;

    // Encrypt content with AES-GCM
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plaintextBytes = new TextEncoder().encode(content);

    const aesKey = await crypto.subtle.importKey(
      'raw',
      messageKey,
      { name: 'AES-GCM' },
      false,
      ['encrypt']
    );

    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      aesKey,
      plaintextBytes
    );

    const ciphertextSlice = encrypted.slice(0, -16);
    const tagSlice = encrypted.slice(-16);

    const dhPublicStr = await this.exportKeyToString(this.sendDH.publicKey);
    const selfIdPublicStr = await this.exportKeyToString(this.selfIdentityKeys.publicKey);

    const now = Date.now();
    const ttl = options?.ttl;
    const expiresAt = ttl && ttl > 0 ? now + ttl : undefined;

    const envelope: MessageEnvelope = {
      version: 1,
      channelId: this.channelId,
      senderId: this.selfUserId,
      senderIdentityPublic: selfIdPublicStr,
      header: {
        dhPublic: dhPublicStr,
        n: currentMsgNumber,
        pn: this.previousChainLength,
      },
      ciphertext: this.bufferToBase64(ciphertextSlice),
      iv: this.bufferToBase64(iv),
      tag: this.bufferToBase64(tagSlice),
      ttl,
      expiresAt,
      timestamp: now,
    };

    // Store in local history
    this.history.push({
      id: `dm_${now}_${Math.random().toString(36).substr(2, 6)}`,
      channelId: this.channelId,
      senderId: this.selfUserId,
      content,
      timestamp: now,
      ttl,
      expiresAt,
    });

    return envelope;
  }

  /**
   * Receive and decrypt an envelope
   */
  async receiveEnvelope(envelope: MessageEnvelope): Promise<DecryptedMessage> {
    await this.ensureResponderInitialized(envelope);

    const dhKeyId = envelope.header.dhPublic;
    const msgNum = envelope.header.n;

    // Check if we previously skipped and cached this key
    const cacheKey = `${dhKeyId}:${msgNum}`;
    let messageKey: ArrayBuffer | undefined = this.skippedKeys.get(cacheKey);

    if (messageKey) {
      this.skippedKeys.delete(cacheKey);
    } else {
      // Check if DH ratchet step is needed (peer rotated their DH public key)
      if (this.remoteDHPublicRaw && envelope.header.dhPublic !== this.remoteDHPublicRaw) {
        // Skip any unreceived messages from the old receiving chain
        await this.skipMessageKeys(envelope.header.pn);
        await this.dhRatchet(envelope.header.dhPublic);
      }

      // Skip unreceived messages in current chain
      await this.skipMessageKeys(envelope.header.n);

      // Derive message key for current message
      if (!this.recvChainKey) {
        throw new Error('Receive chain key missing during decryption');
      }

      const { nextChainKey, messageKey: derivedKey } = await this.kdfChain(this.recvChainKey);
      this.recvChainKey = nextChainKey;
      this.recvMessageNumber++;
      messageKey = derivedKey;
    }

    // Decrypt AES-GCM
    const ciphertextBytes = this.base64ToBuffer(envelope.ciphertext);
    const ivBytes = this.base64ToBuffer(envelope.iv);
    const tagBytes = this.base64ToBuffer(envelope.tag);

    const combinedEncrypted = new Uint8Array(ciphertextBytes.byteLength + tagBytes.byteLength);
    combinedEncrypted.set(new Uint8Array(ciphertextBytes), 0);
    combinedEncrypted.set(new Uint8Array(tagBytes), ciphertextBytes.byteLength);

    const aesKey = await crypto.subtle.importKey(
      'raw',
      messageKey,
      { name: 'AES-GCM' },
      false,
      ['decrypt']
    );

    const decryptedBytes = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(ivBytes) },
      aesKey,
      combinedEncrypted
    );

    const content = new TextDecoder().decode(decryptedBytes);

    const decryptedMsg: DecryptedMessage = {
      id: `dm_${envelope.timestamp}_${Math.random().toString(36).substr(2, 6)}`,
      channelId: envelope.channelId,
      senderId: envelope.senderId,
      content,
      timestamp: envelope.timestamp,
      ttl: envelope.ttl,
      expiresAt: envelope.expiresAt,
    };

    this.history.push(decryptedMsg);
    return decryptedMsg;
  }

  /**
   * Advance DH ratchet when peer rotates DH key
   */
  private async dhRatchet(newRemoteDHPublicStr: string): Promise<void> {
    if (!this.rootKey || !this.sendDH) {
      throw new Error('Cannot advance DH ratchet without root key and send DH');
    }

    this.previousChainLength = this.sendMessageNumber;
    this.sendMessageNumber = 0;
    this.recvMessageNumber = 0;

    this.remoteDHPublicRaw = newRemoteDHPublicStr;
    this.remoteDHPublic = await this.importKeyFromString(newRemoteDHPublicStr, 'public');

    // DH step 1: DH(our sendDH.private, their new remote DH) -> advance recv chain
    const dhRecv = await crypto.subtle.deriveBits(
      { name: 'ECDH', public: this.remoteDHPublic },
      this.sendDH.privateKey,
      256
    );
    const { rootKey: rk1, chainKey: recvChain } = await this.kdfRK(this.rootKey, dhRecv);
    this.rootKey = rk1;
    this.recvChainKey = recvChain;

    // DH step 2: Generate new sendDH keypair and advance send chain
    this.sendDH = await crypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      ['deriveBits']
    );

    const dhSend = await crypto.subtle.deriveBits(
      { name: 'ECDH', public: this.remoteDHPublic },
      this.sendDH.privateKey,
      256
    );
    const { rootKey: rk2, chainKey: sendChain } = await this.kdfRK(this.rootKey, dhSend);
    this.rootKey = rk2;
    this.sendChainKey = sendChain;
  }

  /**
   * Skipped keys caching for out-of-order messages
   */
  private async skipMessageKeys(until: number): Promise<void> {
    if (!this.recvChainKey || !this.remoteDHPublicRaw) return;

    if (this.recvMessageNumber + 1000 < until) {
      throw new Error('Too many skipped messages');
    }

    while (this.recvMessageNumber < until) {
      const { nextChainKey, messageKey } = await this.kdfChain(this.recvChainKey);
      this.recvChainKey = nextChainKey;

      const cacheKey = `${this.remoteDHPublicRaw}:${this.recvMessageNumber}`;
      if (this.skippedKeys.size >= this.MAX_SKIPPED_KEYS) {
        const firstKey = this.skippedKeys.keys().next().value;
        if (firstKey) this.skippedKeys.delete(firstKey);
      }
      this.skippedKeys.set(cacheKey, messageKey);
      this.recvMessageNumber++;
    }
  }

  // --- KDF Helpers ---

  private async kdfRK(rk: ArrayBuffer, dhOut: ArrayBuffer): Promise<{ rootKey: ArrayBuffer; chainKey: ArrayBuffer }> {
    const hmacKey = await crypto.subtle.importKey(
      'raw',
      rk,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const derived = await crypto.subtle.sign('HMAC', hmacKey, dhOut);

    const derivedHmac = await crypto.subtle.importKey(
      'raw',
      derived,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const rootKey = await crypto.subtle.sign('HMAC', derivedHmac, new Uint8Array([0x01]));
    const chainKey = await crypto.subtle.sign('HMAC', derivedHmac, new Uint8Array([0x02]));

    return { rootKey, chainKey };
  }

  private async kdfChain(chainKey: ArrayBuffer): Promise<{ nextChainKey: ArrayBuffer; messageKey: ArrayBuffer }> {
    const hmacKey = await crypto.subtle.importKey(
      'raw',
      chainKey,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const messageKey = await crypto.subtle.sign('HMAC', hmacKey, new Uint8Array([0x01]));
    const nextChainKey = await crypto.subtle.sign('HMAC', hmacKey, new Uint8Array([0x02]));

    return { nextChainKey, messageKey };
  }

  // --- Encoding & Key Format Helpers ---

  private async exportKeyToString(key: CryptoKey): Promise<string> {
    const exported = await crypto.subtle.exportKey('spki', key);
    return this.bufferToBase64(exported);
  }

  private async importKeyFromString(keyStr: string, type: 'public'): Promise<CryptoKey> {
    const trimmed = keyStr.trim();
    if (trimmed.startsWith('{')) {
      const jwk = JSON.parse(trimmed);
      return crypto.subtle.importKey(
        'jwk',
        jwk,
        { name: 'ECDH', namedCurve: 'P-256' },
        true,
        type === 'public' ? [] : ['deriveBits']
      );
    }

    const keyBytes = this.base64ToBuffer(trimmed);
    return crypto.subtle.importKey(
      'spki',
      keyBytes,
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      []
    );
  }

  private bufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  private base64ToBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }
}
