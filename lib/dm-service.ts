// DirectMessageClient: the framework-free client stack that owns DM sessions.
// The Initiator acts on a Contact's Identity Bundle; the Responder completes X3DH
// on the first inbound Message Envelope (ADR-0005). Envelopes travel over the
// Pairwise Channel room plus the recipient's deterministic inbox room so first
// contact works without the recipient having added the sender.

import {
  DirectMessageSession,
  type MessageEnvelope,
  type DecryptedMessage,
} from './direct-message-session';
import type { IdentityVault } from './identity-vault';
import { exportIdentityBundle } from './identity-bundle';
import type { Contact } from './contact-manager';

export type Transport = (roomId: string, envelope: MessageEnvelope) => Promise<void> | void;

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Deterministic inbox room for an identity: everyone can compute it from the
 * identity public key, so first-contact envelopes reach the recipient without
 * a shared channel being known in advance.
 */
export async function deriveInboxRoomId(identityPublicKeySpkiB64: string): Promise<string> {
  return 'inbox_' + (await sha256Hex('anonchat-inbox-v1|' + identityPublicKeySpkiB64.trim()));
}

export interface DirectMessageClientOptions {
  selfUserId: string;
  vault: IdentityVault;
}

export class DirectMessageClient {
  private readonly selfUserId: string;
  private readonly vault: IdentityVault;
  private readonly sessions = new Map<string, DirectMessageSession>();
  private readonly remoteIdentityByChannel = new Map<string, string>();
  private readonly messagesLog: DecryptedMessage[] = [];

  constructor(options: DirectMessageClientOptions) {
    this.selfUserId = options.selfUserId;
    this.vault = options.vault;
  }

  private async newSession(): Promise<DirectMessageSession> {
    const identityKeys = await this.vault.getIdentityKeyPair();
    const preKey = await this.vault.getPreKeyPair();
    const signing = await this.vault.getSigningKeyPair();
    return new DirectMessageSession({
      selfUserId: this.selfUserId,
      selfIdentityKeys: identityKeys,
      selfPreKeys: { id: preKey.id, publicKey: preKey.publicKey, privateKey: preKey.privateKey },
      selfSigningKeys: signing,
      pqDecapsulate: this.vault.hasPqKem()
        ? (cipherText) => this.vault.decapsulatePq(cipherText)
        : undefined,
    });
  }

  /** Sealed sender (ADR-0007): own envelopes come back via catch-up polling; recognise
   *  them by ciphertext hash (the wire carries no sender identity to check). */
  private readonly recentSentHashes = new Set<string>();
  private readonly MAX_SENT_HASHES = 500;

  private rememberSent(envelope: MessageEnvelope): void {
    const fingerprint = `${envelope.channelId}|${envelope.iv}|${envelope.ciphertext}`;
    this.recentSentHashes.add(fingerprint);
    if (this.recentSentHashes.size > this.MAX_SENT_HASHES) {
      const oldest = this.recentSentHashes.values().next().value;
      if (oldest !== undefined) this.recentSentHashes.delete(oldest);
    }
  }

  /** Initiator: create (or reuse) the session for a Contact from its Identity Bundle. */
  async sessionForContact(contact: Contact): Promise<DirectMessageSession> {
    const existingChannel = [...this.remoteIdentityByChannel.entries()].find(
      ([, remote]) => remote.trim() === contact.identity.identityPublicKey.trim(),
    )?.[0];
    if (existingChannel) return this.sessions.get(existingChannel)!;

    const session = await this.newSession();
    await session.initiate(contact);
    const channelId = session.getChannelId();
    if (!channelId) throw new Error('Session initiation failed to derive the Pairwise Channel');
    this.sessions.set(channelId, session);
    this.remoteIdentityByChannel.set(channelId, contact.identity.identityPublicKey);
    return session;
  }

  /** Initiator: send the first message to a Contact, fanning out to channel + inbox. */
  async sendToContact(
    contact: Contact,
    content: string,
    ttl?: number,
    transport?: Transport,
  ): Promise<MessageEnvelope> {
    const session = await this.sessionForContact(contact);
    const envelope = await session.sendMessage(content, { ttl });
    this.rememberSent(envelope);
    if (transport) {
      const recipientInbox = await deriveInboxRoomId(contact.identity.identityPublicKey);
      await transport(envelope.channelId, envelope);
      await transport(recipientInbox, envelope);
    }
    return envelope;
  }

  /** Send on an established Pairwise Channel (as Initiator or Responder). */
  async reply(
    channelId: string,
    content: string,
    ttl?: number,
    transport?: Transport,
  ): Promise<MessageEnvelope> {
    const session = this.sessions.get(channelId);
    if (!session) throw new Error(`No session on channel ${channelId}`);
    const envelope = await session.sendMessage(content, { ttl });
    this.rememberSent(envelope);
    if (transport) {
      const remote = this.remoteIdentityByChannel.get(channelId);
      if (remote) await transport(await deriveInboxRoomId(remote), envelope);
      await transport(channelId, envelope);
    }
    return envelope;
  }

  /**
   * Responder or existing-session receiver. An envelope for an unknown channel
   * completes the X3DH handshake with our vault Pre-Key and opens the session.
   * Duplicate deliveries (the same envelope can arrive via the Pairwise Channel
   * room and the inbox room, or via both socket push and catch-up polling) are
   * idempotent: they return null instead of surfacing a replay error.
   */
  async handleInboundEnvelope(envelope: MessageEnvelope): Promise<DecryptedMessage | null> {
    // Catch-up polling (and multi-room fan-out) can hand us our own envelopes;
    // they are never inbound messages. Sealed envelopes carry no sender identity,
    // so we recognise our own traffic by the exact (channel, iv, ciphertext) we sent.
    if (this.recentSentHashes.has(`${envelope.channelId}|${envelope.iv}|${envelope.ciphertext}`)) {
      return null;
    }

    let session = this.sessions.get(envelope.channelId);
    if (!session) {
      session = await this.newSession();
    }
    let decrypted: DecryptedMessage;
    try {
      decrypted = await session.receiveEnvelope(envelope);
    } catch (e) {
      if (e instanceof Error && /replayed message rejected/i.test(e.message)) {
        return null; // already processed — duplicate delivery
      }
      // Double-initiate collision (#18): both peers opened sessions on the same
      // Pairwise Channel before either received. Our initiator session has never
      // decrypted anything, so the peer's initiation wins: retry once with a
      // fresh responder session and keep whichever actually decrypts.
      if (session.hasReceivedMessage()) throw e;
      try {
        const retry = await this.newSession();
        decrypted = await retry.receiveEnvelope(envelope);
        session = retry;
      } catch {
        throw e; // original failure — not a collision (tamper, corruption, …)
      }
    }
    this.sessions.set(decrypted.channelId, session);
    const remoteIdentity = decrypted.senderIdentityPublic ?? envelope.senderIdentityPublic;
    if (remoteIdentity) {
      this.remoteIdentityByChannel.set(decrypted.channelId, remoteIdentity);
    }
    this.messagesLog.push(decrypted);
    return decrypted;
  }

  /** Our own Identity Bundle (v2 when the vault carries PQ keys) for Room Intros. */
  async exportOwnBundle(): Promise<ReturnType<typeof exportIdentityBundle>> {
    return exportIdentityBundle(this.vault);
  }

  /** Open (or reuse) the DM session toward a Contact reached via a Room Intro. */
  async channelForIntro(contact: Contact): Promise<string> {
    const session = await this.sessionForContact(contact);
    const channelId = session.getChannelId();
    if (!channelId) throw new Error('Intro channel setup failed');
    return channelId;
  }

  /** Pairwise Channels this client has sessions on. */
  channels(): string[] {
    return [...this.sessions.keys()];
  }

  /** Rooms to poll for catch-up: our inbox plus every known channel. */
  async pollableRooms(): Promise<string[]> {
    const rooms = [...this.sessions.keys()];
    rooms.unshift(await deriveInboxRoomId(await this.ownIdentityPublic()));
    return rooms;
  }

  private ownIdentityPublicCache: string | null = null;
  private async ownIdentityPublic(): Promise<string> {
    if (!this.ownIdentityPublicCache) {
      const identity = await this.vault.getIdentityKeyPair();
      this.ownIdentityPublicCache = btoa(
        String.fromCharCode(...new Uint8Array(await crypto.subtle.exportKey('spki', identity.publicKey))),
      );
    }
    return this.ownIdentityPublicCache;
  }

  /** Decrypted messages received so far (local, in arrival order). */
  messages(): DecryptedMessage[] {
    return [...this.messagesLog];
  }
}
