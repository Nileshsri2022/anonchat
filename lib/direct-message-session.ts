import { ml_kem768 } from '@noble/post-quantum/ml-kem.js';
import { webcrypto } from 'crypto';
import type { Contact } from './contact-manager';
import { pqSignedMaterial } from './identity-bundle';

export interface IdentityKeys {
  publicKey: CryptoKey;
  privateKey: CryptoKey;
}

export interface PreKeys {
  id: number;
  publicKey: CryptoKey;
  privateKey: CryptoKey;
}

const crypto = globalThis.crypto || webcrypto;

export interface MessageEnvelope {
  version: number;
  channelId: string;
  /** v2 only — sealed Envelope v3 carries NO sender identity on the wire (ADR-0007). */
  senderId?: string;
  senderIdentityPublic?: string; // base64 SPKI or JWK; v3 omits entirely
  header: {
    dhPublic: string;
    /** ML-KEM-768 ciphertext (base64) on the FIRST envelope of a hybrid handshake (ADR-0006). */
    pqCiphertext?: string; // base64 SPKI
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
  /** Sealed sender: who sent this is a decryption OUTPUT, not a wire field (ADR-0007). */
  senderIdentityPublic?: string;
  /** Control payload (typing/read) — never rendered as chat content (ticket 21). */
  control?: { type: 'typing' } | { type: 'read'; upTo: number };
}

export interface DirectMessageSessionConfig {
  selfUserId: string;
  selfIdentityKeys: IdentityKeys;
  selfPreKeys?: PreKeys;
  /** Signing keypair — the initiator signs its ephemeral so the responder can
   *  authenticate the sealed first payload (ADR-0007, Envelope v3). */
  selfSigningKeys?: { publicKey: CryptoKey; privateKey: CryptoKey };
  /** Upper bound for the Skipped-Key Cache (default 1000). */
  maxSkippedKeys?: number;
  /** ML-KEM decapsulation capability — the responder side of the hybrid handshake (ADR-0006). */
  pqDecapsulate?: (cipherText: Uint8Array) => Promise<Uint8Array<ArrayBuffer>>;
}

/**
 * Derives a deterministic Pairwise Channel ID from two public keys.
 * Sorts public keys lexicographically so both peers derive the exact same channel ID.
 */
export async function derivePairwiseChannelId(pkA: string, pkB: string): Promise<string> {
  const sorted = [pkA.trim(), pkB.trim()].sort();
  const combined = new TextEncoder().encode(sorted.join(':'));
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
  private recipientIdentityPublicCanonical?: string;

  private sendMessageNumber = 0;
  private recvMessageNumber = 0;
  private previousChainLength = 0;
  /** True once any inbound envelope decrypted successfully (collision recovery, #18). */
  private receivedAny = false;

  private readonly pqDecapsulate?: (cipherText: Uint8Array) => Promise<Uint8Array<ArrayBuffer>>;
  private readonly selfSigningKeys?: { publicKey: CryptoKey; privateKey: CryptoKey };
  /** Initiator-only: KEM ciphertext sent on the FIRST envelope of a hybrid session. */
  private pendingPqCiphertext?: string;
  /** Initiator-only: signature over our first ephemeral, sent inside the sealed first payload. */
  private pendingSenderSignature?: string;

  // Skipped-key cache for out-of-order message delivery (max 1000 keys)
  private skippedKeys = new Map<string, ArrayBuffer>();
  private readonly MAX_SKIPPED_KEYS: number;

  // Consumed (dhPublic, message-number) pairs, bounded — replays are rejected outright
  private consumedKeys = new Set<string>();
  private readonly MAX_CONSUMED_KEYS = 5000;

  private history: DecryptedMessage[] = [];

  constructor(config: DirectMessageSessionConfig) {
    this.selfUserId = config.selfUserId;
    this.selfIdentityKeys = config.selfIdentityKeys;
    this.selfPreKeys = config.selfPreKeys;
    this.pqDecapsulate = config.pqDecapsulate;
    this.selfSigningKeys = config.selfSigningKeys;
    this.MAX_SKIPPED_KEYS = config.maxSkippedKeys ?? 1000;
  }

  getChannelId(): string | undefined {
    return this.channelId;
  }

  /** Whether this session ever successfully decrypted an inbound message. */
  hasReceivedMessage(): boolean {
    return this.receivedAny;
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

    // Verify the Contact's Pre-Key signature before using the Pre-Key (ADR-0005).
    await this.verifyPreKeySignature(recipientContact, remotePreKey);
    this.recipientIdentityPublicCanonical = await this.exportKeyToString(remoteIdentityKey);

    // Generate Alice's initial DH keypair
    this.sendDH = await crypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      ['deriveBits']
    );

    // Hybrid PQ share (ADR-0006): encapsulate against the Contact's ML-KEM key when published.
    // Defense in depth: re-verify the PQ key's signature at the point of use (the Pre-Key
    // signature gets the same treatment above), so an unvalidated Contact cannot steer
    // the PQ share to an attacker's key.
    let pqShared: Uint8Array<ArrayBuffer> | undefined;
    if (recipientContact.identity.pqKemPublicB64) {
      const { pqKemPublicB64, pqKemSignatureB64, identitySigningPublicKey } = recipientContact.identity;
      // Fail closed: a PQ key without its signature is untrusted — never encapsulate to it.
      if (!pqKemSignatureB64 || !identitySigningPublicKey) {
        throw new Error('PQ key present without the required signature; refusing hybrid handshake');
      }
      await this.verifySignatureOver(
        identitySigningPublicKey,
        pqKemSignatureB64,
        new Uint8Array([
          ...new TextEncoder().encode(pqSignedMaterial(pqKemPublicB64, recipientContact.identity.displayName)),
        ]),
      );
      const encapsulated = ml_kem768.encapsulate(this.b64ToBytes(pqKemPublicB64));
      pqShared = this.copyBytes(encapsulated.sharedSecret);
      this.pendingPqCiphertext = this.bytesToB64(encapsulated.cipherText);
    }

    // Sealed-sender handshake (ADR-0007): DH1 (identity x pre-key) is DROPPED on v3 —
    // the responder must not need our identity before decryption. Our identity key +
    // a signature over the ephemeral ride INSIDE the encrypted first payload instead.
    const dhEphemeralIdentity = await crypto.subtle.deriveBits(
      { name: 'ECDH', public: remoteIdentityKey },
      this.sendDH.privateKey,
      256
    );
    const dhEphemeralPreKey = await crypto.subtle.deriveBits(
      { name: 'ECDH', public: remotePreKey },
      this.sendDH.privateKey,
      256
    );

    if (this.selfSigningKeys) {
      const ephemeralStr = await this.exportKeyToString(this.sendDH.publicKey);
      const sig = await crypto.subtle.sign(
        { name: 'ECDSA', hash: 'SHA-256' },
        this.selfSigningKeys.privateKey,
        new TextEncoder().encode(`anonchat-ephemeral-v3|${ephemeralStr}`),
      );
      this.pendingSenderSignature = this.bytesToB64(new Uint8Array(sig));
    }

    const masterSharedSecret = await this.computeX3DHSecret(
      dhEphemeralIdentity,
      dhEphemeralPreKey,
      undefined,
      pqShared
    );

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

    const sealed = envelope.version === 3;
    // v2 carries the sender identity on the wire; v3 (sealed, ADR-0007) must not
    // need it before decryption — the identity arrives inside the first payload.
    const remoteIdentityKey = sealed
      ? undefined
      : await this.importKeyFromString(envelope.senderIdentityPublic!, 'public');
    if (!sealed) {
      this.recipientIdentityPublicCanonical = await this.exportKeyToString(remoteIdentityKey!);
    }
    const remoteDH = await this.importKeyFromString(envelope.header.dhPublic, 'public');

    // Bob X3DH:
    const dhIdentityEphemeral = await crypto.subtle.deriveBits(
      { name: 'ECDH', public: remoteDH },
      this.selfIdentityKeys.privateKey,
      256
    );
    const dhPreKeyEphemeral = await crypto.subtle.deriveBits(
      { name: 'ECDH', public: remoteDH },
      this.selfPreKeys.privateKey,
      256
    );
    const dhPreKeyIdentity = sealed
      ? undefined
      : await crypto.subtle.deriveBits(
          { name: 'ECDH', public: remoteIdentityKey! },
          this.selfPreKeys.privateKey,
          256
        );

    // Hybrid PQ share (ADR-0006): a KEM ciphertext on the handshake envelope MUST be
    // decapsulatable — the initiator already derived the hybrid root, so degrading to
    // classical would silently produce a dead session.
    let pqShared: Uint8Array<ArrayBuffer> | undefined;
    if (envelope.header.pqCiphertext) {
      if (!this.pqDecapsulate) {
        throw new Error('Hybrid PQ handshake required but this session lacks PQ capability');
      }
      pqShared = await this.pqDecapsulate(this.b64ToBytes(envelope.header.pqCiphertext));
    }

    const masterSharedSecret = sealed
      ? await this.computeX3DHSecret(dhIdentityEphemeral, dhPreKeyEphemeral, undefined, pqShared)
      : await this.computeX3DHSecret(dhPreKeyIdentity!, dhIdentityEphemeral, dhPreKeyEphemeral, pqShared);

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

    if (sealed) {
      // Sealed sender: the Pairwise Channel is on the wire (routing requires it).
      this.channelId = envelope.channelId;
    } else {
      const selfPublicStr = await this.exportKeyToString(this.selfIdentityKeys.publicKey);
      this.channelId = envelope.channelId || (await derivePairwiseChannelId(selfPublicStr, envelope.senderIdentityPublic!));
    }
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

    const dhPublicStr = await this.exportKeyToString(this.sendDH.publicKey);
    const selfIdPublicStr = await this.exportKeyToString(this.selfIdentityKeys.publicKey);

    // Envelope v3 (ADR-0007): sealed sender. The plaintext is a JSON payload so the
    // FIRST message can carry {ik, sig} — identity + ephemeral signature — inside the
    // ciphertext; later messages carry only the content.
    const firstMessage = currentMsgNumber === 0 && this.pendingSenderSignature !== undefined;
    const payload = JSON.stringify({
      v: 3,
      c: content,
      ...(firstMessage && this.selfSigningKeys
        ? {
            ik: selfIdPublicStr,
            // signing key travels too — the signature binds the ephemeral to it;
            // the ik<->sk binding itself is SAS-verified out-of-band (TOFU unchanged)
            sk: await this.exportKeyToString(this.selfSigningKeys.publicKey),
            sig: this.pendingSenderSignature,
          }
        : {}),
    });
    if (firstMessage) this.pendingSenderSignature = undefined; // identity rides message 0 only

    // v3 wire context binds channel + recipient only — the sender is sealed (ADR-0007)
    const aad = await this.envelopeAadV3(this.channelId, this.recipientIdentityPublicCanonical);
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: aad },
      aesKey,
      new TextEncoder().encode(payload)
    );

    const ciphertextSlice = encrypted.slice(0, -16);
    const tagSlice = encrypted.slice(-16);

    const pqCiphertext = this.pendingPqCiphertext;
    this.pendingPqCiphertext = undefined; // KEM ciphertext rides the FIRST envelope only

    const now = Date.now();
    const ttl = options?.ttl;
    const expiresAt = ttl && ttl > 0 ? now + ttl : undefined;

    const envelope: MessageEnvelope = {
      version: 3,
      channelId: this.channelId,
      header: {
        dhPublic: dhPublicStr,
        n: currentMsgNumber,
        pn: this.previousChainLength,
        ...(pqCiphertext ? { pqCiphertext } : {}),
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
    if (envelope.version !== 2 && envelope.version !== 3) {
      throw new Error(`Unsupported Message Envelope version: ${envelope.version}`);
    }

    await this.ensureResponderInitialized(envelope);

    const dhKeyId = envelope.header.dhPublic;
    const msgNum = envelope.header.n;

    // Replay protection: an already-consumed (dhPublic, n) pair is rejected outright
    const consumedKey = `${dhKeyId}:${msgNum}`;
    if (this.consumedKeys.has(consumedKey)) {
      throw new Error(`Replayed message rejected (n=${msgNum} of this chain already consumed)`);
    }

    // Check if we previously skipped and cached this key
    const cacheKey = `${dhKeyId}:${msgNum}`;
    let messageKey: ArrayBuffer | undefined = this.skippedKeys.get(cacheKey);

    if (messageKey) {
      this.skippedKeys.delete(cacheKey);
    } else if (this.remoteDHPublicRaw === dhKeyId && msgNum < this.recvMessageNumber) {
      throw new Error(`Skipped key evicted or already consumed (n=${msgNum} is below the receive pointer)`);
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

    // Recompute the wire-context AAD: v2 binds both wire identities; v3 binds
    // channel + recipient only — the sender is sealed inside the ciphertext.
    const selfIdPublicStr = await this.exportKeyToString(this.selfIdentityKeys.publicKey);
    const aad =
      envelope.version === 3
        ? await this.envelopeAadV3(envelope.channelId, selfIdPublicStr)
        : await this.envelopeAad(envelope.channelId, envelope.senderIdentityPublic!, selfIdPublicStr);

    const decryptedBytes = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(ivBytes), additionalData: aad },
      aesKey,
      combinedEncrypted
    );

    let content: string;
    let senderIdentityPublic: string | undefined;
    if (envelope.version === 3) {
      const parsed = JSON.parse(new TextDecoder().decode(decryptedBytes)) as {
        v: number;
        c: string;
        ik?: string;
        sk?: string;
        sig?: string;
      };
      content = parsed.c;
      if (parsed.ik && parsed.sk && parsed.sig) {
        // Sealed sender authentication: the claimed identity must prove possession of
        // the signing key bound to THIS session's ephemeral (ADR-0007). Trust-on-first-
        // use is unchanged: the ik<->signing-key binding is SAS-verified later.
        await this.verifySignatureOver(
          parsed.sk,
          parsed.sig,
          new TextEncoder().encode(`anonchat-ephemeral-v3|${envelope.header.dhPublic}`),
          'Sender ephemeral',
        );
        senderIdentityPublic = parsed.ik;
        if (!this.recipientIdentityPublicCanonical) {
          this.recipientIdentityPublicCanonical = parsed.ik;
        }
      } else if (!this.recipientIdentityPublicCanonical && envelope.header.n === 0) {
        // Message 0 MUST introduce the sender. Later messages may arrive (out of
        // order) before it; they attribute once message 0 lands via the skip cache.
        throw new Error('Sealed first message carried no authenticatable sender identity');
      }
      senderIdentityPublic = senderIdentityPublic ?? this.recipientIdentityPublicCanonical;
    } else {
      content = new TextDecoder().decode(decryptedBytes);
      senderIdentityPublic = envelope.senderIdentityPublic;
    }

    // Record the consumed key so replays of this exact envelope are rejected
    this.consumedKeys.add(consumedKey);
    if (this.consumedKeys.size > this.MAX_CONSUMED_KEYS) {
      const oldest = this.consumedKeys.values().next().value;
      if (oldest !== undefined) this.consumedKeys.delete(oldest);
    }

    this.receivedAny = true;
    const decryptedMsg: DecryptedMessage = {
      id: `dm_${envelope.timestamp}_${Math.random().toString(36).substr(2, 6)}`,
      channelId: envelope.channelId,
      senderId: senderIdentityPublic ? `sealed_${senderIdentityPublic.slice(0, 8)}` : (envelope.senderId ?? 'peer'),
      senderIdentityPublic,
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
    const { rootKey: recvRootKey, chainKey: recvChain } = await this.kdfRK(this.rootKey, dhRecv);
    this.rootKey = recvRootKey;
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
    const { rootKey: sendRootKey, chainKey: sendChain } = await this.kdfRK(this.rootKey, dhSend);
    this.rootKey = sendRootKey;
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

  // --- Cryptographic & KDF Helpers ---

  /**
   * Wire-context additional data bound into every envelope's AES-GCM authentication:
   * protocol version, Pairwise Channel ID, sender identity, recipient identity.
   * Both peers derive the identical string from canonical SPKI base64 forms.
   */
  /** Envelope v3 wire context: channel + recipient — no sender on a sealed envelope. */
  private async envelopeAadV3(
    channelId: string,
    recipientIdentityPublic?: string,
  ): Promise<Uint8Array<ArrayBuffer>> {
    if (!channelId || !recipientIdentityPublic) {
      throw new Error('Missing wire context for sealed envelope authentication');
    }
    const context = `anonchat-dm-v3|${channelId.trim()}|${recipientIdentityPublic.trim()}`;
    const encoded = new TextEncoder().encode(context);
    const out = new Uint8Array(new ArrayBuffer(encoded.byteLength));
    out.set(encoded);
    return out;
  }

  private async envelopeAad(
    channelId: string,
    senderIdentityPublic: string,
    recipientIdentityPublic?: string,
  ): Promise<Uint8Array<ArrayBuffer>> {
    if (!channelId || !senderIdentityPublic || !recipientIdentityPublic) {
      throw new Error('Missing wire context for envelope authentication');
    }
    const context = `anonchat-dm-v2|${channelId.trim()}|${senderIdentityPublic.trim()}|${recipientIdentityPublic.trim()}`;
    const encoded = new TextEncoder().encode(context);
    const out = new Uint8Array(new ArrayBuffer(encoded.byteLength));
    out.set(encoded);
    return out;
  }

  /**
   * Verifies the Contact's Pre-Key signature (ECDSA-P256/SHA-256 over the Pre-Key's
   * SPKI bytes) under the Contact's signing public key. Throws when the bundle lacks
   * a signature or the signature does not verify.
   */
  private async verifyPreKeySignature(contact: Contact, remotePreKey: CryptoKey): Promise<void> {
    const { identitySigningPublicKey, preKeySignature } = contact.identity;
    if (!identitySigningPublicKey || !preKeySignature) {
      throw new Error('Contact Identity Bundle lacks a Pre-Key signature; refusing to initiate an unauthenticated session');
    }

    const signingKey = await crypto.subtle.importKey(
      'spki',
      this.base64ToBuffer(identitySigningPublicKey.trim()),
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['verify'],
    );

    const preKeySpkiBytes = await crypto.subtle.exportKey('spki', remotePreKey);
    const valid = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      signingKey,
      this.base64ToBuffer(preKeySignature.trim()),
      preKeySpkiBytes,
    );

    if (!valid) {
      throw new Error('Pre-Key signature verification failed; the Identity Bundle may be forged or corrupted');
    }
  }

  /**
   * HKDF-SHA-256 (extract-then-expand) over the raw key material.
   */
  private async hkdf(ikm: ArrayBuffer, salt: ArrayBuffer | Uint8Array<ArrayBuffer>, info: ArrayBuffer, bits: number): Promise<ArrayBuffer> {
    const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
    return crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, bits);
  }

  private utf8(s: string): ArrayBuffer {
    const encoded = new TextEncoder().encode(s);
    const out = new Uint8Array(new ArrayBuffer(encoded.byteLength));
    out.set(encoded);
    return out.buffer as ArrayBuffer;
  }

  private async computeX3DHSecret(
    dhA: ArrayBuffer,
    dhB: ArrayBuffer,
    dhC?: ArrayBuffer,
    pqShared?: Uint8Array<ArrayBuffer>
  ): Promise<ArrayBuffer> {
    const combinedDH = new Uint8Array([
      ...new Uint8Array(dhA),
      ...new Uint8Array(dhB),
      ...(dhC ? new Uint8Array(dhC) : []),
      ...(pqShared ?? []),
    ]);
    // Distinct domains keep hybrid roots from ever colliding with classical-only roots.
    const domain = pqShared ? 'anonchat-pqxdh-v1' : 'anonchat-x3dh-v1';
    return this.hkdf(combinedDH.buffer as ArrayBuffer, new Uint8Array(new ArrayBuffer(32)), this.utf8(domain), 256);
  }

  private async verifySignatureOver(
    signingPublicSpkiB64: string,
    signatureB64: string,
    signedBytes: Uint8Array<ArrayBuffer>,
    what = 'PQ key',
  ): Promise<void> {
    const signingPub = await crypto.subtle.importKey(
      'spki',
      this.b64ToBytes(signingPublicSpkiB64),
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['verify'],
    );
    const ok = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      signingPub,
      this.b64ToBytes(signatureB64),
      signedBytes,
    );
    if (!ok) {
      throw new Error(`${what} signature verification failed for this Contact`);
    }
  }

  private b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
    const raw = atob(b64);
    const out = new Uint8Array(new ArrayBuffer(raw.length));
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }

  private bytesToB64(bytes: Uint8Array): string {
    return btoa(String.fromCharCode(...bytes));
  }

  private copyBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
    const out = new Uint8Array(new ArrayBuffer(bytes.length));
    out.set(bytes);
    return out;
  }

  private async kdfRK(currentRootKey: ArrayBuffer, dhOut: ArrayBuffer): Promise<{ rootKey: ArrayBuffer; chainKey: ArrayBuffer }> {
    const derived64 = await this.hkdf(
      dhOut,
      currentRootKey,
      this.utf8('anonchat-rk-v1'),
      512,
    );
    return {
      rootKey: derived64.slice(0, 32),
      chainKey: derived64.slice(32),
    };
  }

  private async kdfChain(chainKey: ArrayBuffer): Promise<{ nextChainKey: ArrayBuffer; messageKey: ArrayBuffer }> {
    const derived64 = await this.hkdf(
      chainKey,
      new Uint8Array(new ArrayBuffer(32)),
      this.utf8('anonchat-ck-v1'),
      512,
    );
    return {
      messageKey: derived64.slice(0, 32),
      nextChainKey: derived64.slice(32),
    };
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
