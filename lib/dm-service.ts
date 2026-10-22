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
    return new DirectMessageSession({
      selfUserId: this.selfUserId,
      selfIdentityKeys: identityKeys,
      selfPreKeys: { id: preKey.id, publicKey: preKey.publicKey, privateKey: preKey.privateKey },
    });
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
    // they are never inbound messages.
    if (envelope.senderIdentityPublic?.trim() === (await this.ownIdentityPublic())) {
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
      throw e;
    }
    this.sessions.set(decrypted.channelId, session);
    this.remoteIdentityByChannel.set(decrypted.channelId, envelope.senderIdentityPublic);
    this.messagesLog.push(decrypted);
    return decrypted;
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
