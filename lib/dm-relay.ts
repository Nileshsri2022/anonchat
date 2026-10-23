// Encode/decode between a Message Envelope and the Relay Message shape the
// relay actually stores (ADR-0007 / ADR-0009).
//
// The relay's contract is "opaque ciphertext + iv, nothing else". A Direct
// Message Envelope is exactly that from the relay's point of view — it must not
// be able to tell an envelope from any other body — so the whole envelope is the
// ciphertext. Keeping the two shapes converted in one place is what stops the
// envelope's own fields (channelId, header, ciphertext) being silently dropped
// on the way through the relay, which is how offline DMs used to disappear.
import type { MessageEnvelope } from './direct-message-session';

export interface EnvelopeRelayMeta {
  id: string;
  roomId: string;
  userId: string;
  username: string;
}

export interface RelayWireMessage {
  id: string;
  roomId: string;
  userId: string;
  username: string;
  encryptedContent: string;
  iv: string;
  timestamp: number;
  expiresAt?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isMessageEnvelope(value: unknown): value is MessageEnvelope {
  if (!isRecord(value)) return false;
  if (typeof value.channelId !== 'string') return false;
  if (typeof value.ciphertext !== 'string') return false;
  if (typeof value.iv !== 'string') return false;
  if (typeof value.tag !== 'string') return false;
  if (typeof value.version !== 'number') return false;
  if (typeof value.timestamp !== 'number') return false;
  const header = value.header;
  if (!isRecord(header)) return false;
  if (typeof header.dhPublic !== 'string') return false;
  if (typeof header.n !== 'number') return false;
  if (typeof header.pn !== 'number') return false;
  return true;
}

/** Wrap a Message Envelope in the only shape the relay stores. */
export function envelopeToRelayMessage(
  envelope: MessageEnvelope,
  meta: EnvelopeRelayMeta,
): RelayWireMessage {
  return {
    id: meta.id,
    roomId: meta.roomId,
    userId: meta.userId,
    username: meta.username,
    encryptedContent: JSON.stringify(envelope),
    iv: envelope.iv,
    timestamp: envelope.timestamp,
    ...(envelope.expiresAt !== undefined ? { expiresAt: envelope.expiresAt } : {}),
  };
}

/**
 * Recover a Message Envelope from a relay record, or null when the record does
 * not carry one. Never guesses: a malformed body is simply not an envelope.
 */
export function relayMessageToEnvelope(value: unknown): MessageEnvelope | null {
  if (!isRecord(value)) return null;
  if (typeof value.encryptedContent !== 'string') return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value.encryptedContent);
  } catch {
    return null;
  }
  return isMessageEnvelope(parsed) ? parsed : null;
}

/** Whether a relay record carries a usable Message Envelope. */
export function isRelayEnvelope(value: unknown): boolean {
  return relayMessageToEnvelope(value) !== null;
}
