'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { Contact } from '@/lib/contact-manager';
import type { DecryptedMessage, MessageEnvelope } from '@/lib/direct-message-session';
import { getDmClient } from '@/lib/instances';
import { isControlPayload } from '@/lib/control-payloads';
import { envelopeToRelayMessage, relayMessageToEnvelope } from '@/lib/dm-relay';
import { getOutbox } from '@/lib/outbox';
import { contactManager } from '@/lib/contact-manager';
import type { DirectMessageClient } from '@/lib/dm-service';
import { socketService } from '@/lib/socket-service';
import { relayAPI } from '@/lib/relay-api';

interface UseDirectMessageReturn {
  outboxCount: number;
  remoteTyping: boolean;
  peerReadUpTo: number | null;
  sendTyping: () => Promise<void>;
  sendReadReceipt: () => Promise<void>;
  messages: DecryptedMessage[];
  isConnected: boolean;
  sendMessage: (content: string, ttl?: number) => Promise<void>;
  isVerified: boolean;
  safetyNumber: string;
}

function isEnvelope(raw: unknown): raw is MessageEnvelope {
  const e = raw as MessageEnvelope;
  return Boolean(e && e.header && typeof e.ciphertext === 'string' && typeof e.channelId === 'string');
}

export function useDirectMessage(contact: Contact): UseDirectMessageReturn {
  const [messages, setMessages] = useState<DecryptedMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [safetyNumber, setSafetyNumber] = useState(contact.identity.fingerprint);
  const clientRef = useRef<DirectMessageClient | null>(null);
  const currentChannelRef = useRef<string | null>(null);
  const [remoteTyping, setRemoteTyping] = useState(false);
  const [peerReadUpTo, setPeerReadUpTo] = useState<number | null>(null);
  const [outboxCount, setOutboxCount] = useState(0);
  const typingSentAtRef = useRef(0);

  const [currentUser] = useState(() => ({
    id: typeof window !== 'undefined' ? localStorage.getItem('anonchat_userid') || `user_${Math.random().toString(36).slice(2, 11)}` : 'user_default',
    username: typeof window !== 'undefined' ? localStorage.getItem('anonchat_username') || `User${Math.floor(Math.random() * 9999)}` : 'User',
  }));

  const appendMessage = useCallback((decrypted: DecryptedMessage) => {
    // Control payloads (typing/read, ticket 21) drive state, never the transcript
    if (decrypted.control?.type === 'typing') {
      setRemoteTyping(true);
      return;
    }
    if (decrypted.control?.type === 'read') {
      setPeerReadUpTo(decrypted.control.upTo);
      return;
    }
    setMessages((prev) => {
      if (prev.some((m) => m.id === decrypted.id)) return prev;
      return [...prev, decrypted];
    });
  }, []);

  /** Deliver an envelope through both transports: socket push + relay REST buffer. */
  const transport = useCallback(async (roomId: string, envelope: MessageEnvelope) => {
    socketService.sendMessage(roomId, envelope);
    try {
      // The relay stores opaque ciphertext, not envelope fields: encode the whole
      // envelope as the body so catch-up polling can hand it back intact.
      await relayAPI.sendMessage(
        envelopeToRelayMessage(envelope, {
          id: `${roomId}_${envelope.timestamp}_${Math.random().toString(36).slice(2, 8)}`,
          roomId,
          userId: currentUser.id,
          username: currentUser.username,
        }),
      );
    } catch {
      // Socket push already covers live recipients; the relay buffer is best-effort
    }
  }, [currentUser.id]);

  /** Throttled typing indicator: at most one per 2.5s while composing (on by default). */
  const sendTyping = useCallback(async () => {
    const client = clientRef.current;
    const channel = currentChannelRef.current;
    if (!client || !channel) return;
    const now = Date.now();
    if (now - typingSentAtRef.current < 2500) return;
    typingSentAtRef.current = now;
    try {
      await client.sendTyping(channel, transport);
    } catch {
      // typing is best-effort
    }
  }, [transport]);

  /** Emit a read receipt if (and only if) the contact opted in. */
  const sendReadReceipt = useCallback(async () => {
    const client = clientRef.current;
    const channel = currentChannelRef.current;
    if (!client || !channel) return;
    try {
      await client.sendReadReceipt(channel, transport);
    } catch {
      // receipts are best-effort
    }
  }, [transport]);

  /** Handle one inbound raw relay/socket object. */
  const acceptInbound = useCallback(async (raw: unknown) => {
    const client = clientRef.current;
    if (!client || !isEnvelope(raw)) return;
    if ((raw as MessageEnvelope).senderId === currentUser.id) return;
    try {
      const decrypted = await client.handleInboundEnvelope(raw as MessageEnvelope);
      if (decrypted) appendMessage(decrypted);
    } catch (err) {
      console.error('Failed to decrypt inbound DM envelope:', err);
    }
  }, [appendMessage, currentUser.id]);

  // Disappearing messages cleanup ticker
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setMessages((prev) => prev.filter((m) => !m.expiresAt || m.expiresAt > now));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Initialize the DM client, subscribe channel + inbox, start catch-up polling
  useEffect(() => {
    let active = true;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    const seenEnvelopes = new Set<string>();

    async function setup(): Promise<(() => void) | undefined> {
      const client = await getDmClient();
      if (!active) return;
      clientRef.current = client;

      // Establish (or reuse) the Initiator session toward this Contact
      await client.sessionForContact(contact);
      if (!active) return;
      currentChannelRef.current = client.channels()[0] ?? null;
      setSafetyNumber(contact.identity.fingerprint);

      socketService.connect();
      setIsConnected(true);

      const handleRaw = (raw: unknown) => {
        const env = raw as MessageEnvelope;
        if (!isEnvelope(env)) return;
        const key = `${env.channelId}:${env.header.n}:${env.timestamp}`;
        if (seenEnvelopes.has(key)) return;
        seenEnvelopes.add(key);
        void acceptInbound(raw);
      };
      socketService.onMessage('*', handleRaw);

      // Subscribe: the Pairwise Channel with this Contact + our deterministic inbox
      const rooms = await client.pollableRooms();
      if (!active) return;
      for (const room of rooms) {
        socketService.joinRoom(room, currentUser.id, currentUser.username);
      }

      // Catch-up polling: drains envelopes sent while we were away (incl. first contact)
      const lastSeen = new Map<string, string | undefined>();
      const poll = async () => {
        if (!active) return;
        const clientNow = clientRef.current;
        if (!clientNow) return;
        for (const room of await clientNow.pollableRooms()) {
          try {
            const buffered = await relayAPI.pollMessages(room, lastSeen.get(room));
            for (const raw of buffered) {
              // The socket hands over the envelope itself; the relay buffer hands
              // over the Relay Message it was encoded into.
              const env = isEnvelope(raw) ? raw : relayMessageToEnvelope(raw);
              if (!env) continue;
              lastSeen.set(room, `${env.channelId}:${env.header.n}:${env.timestamp}`);
              await acceptInbound(env);
            }
          } catch {
            // Relay buffer is optional
          }
        }
      };
      await poll();
      pollTimer = setInterval(poll, 5000);

      return () => {
        if (pollTimer) clearInterval(pollTimer);
        socketService.offMessage('*');
        socketService.leaveRoom(contact.identity.identityPublicKey, currentUser.id);
      };
    }

    const cleanupPromise = setup();

    return () => {
      active = false;
      // Unregister the catch-all synchronously: it takes precedence over every
      // Room handler, so leaving it behind would starve Room traffic.
      socketService.offMessage('*');
      cleanupPromise.then((cleanup) => {
        if (typeof cleanup === 'function') cleanup();
      });
    };
  }, [contact, currentUser.id, acceptInbound]);

  const sendMessage = useCallback(
    async (content: string, ttl?: number) => {
      const client = clientRef.current;
      if (!client) {
        throw new Error('Direct message session is not initialized');
      }

      // First send acts as Initiator from the Contact's Identity Bundle; later sends
      // reuse the established session. Envelopes fan out to channel + recipient inbox.
      await client.sendToContact(contact, content, ttl, transport);

      // Optimistic local echo
      const localMsg: DecryptedMessage = {
        id: `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        channelId: contact.identity.identityPublicKey,
        senderId: currentUser.id,
        content,
        timestamp: Date.now(),
        ttl,
        expiresAt: ttl && ttl > 0 ? Date.now() + ttl : undefined,
      };
      appendMessage(localMsg);
    },
    [contact, currentUser.id, transport, appendMessage],
  );

  // Flush the outbox when connectivity returns; nothing is silently dropped.
  useEffect(() => {
    let active = true;
    const flush = async () => {
      const outbox = await getOutbox();
      if (outbox.count() === 0) return;
      const client = await getDmClient();
      const contactForIdentity = (identity: string): Contact | null =>
        contactManager.getAllContacts().find((c) => c.identity.identityPublicKey.trim() === identity.trim()) ?? null;
      await outbox.flush(async (channelId, _env, item) => {
        if (client.channels().includes(channelId)) {
          await client.reply(channelId, item.content);
          return;
        }
        const remote = client.identityForChannel(channelId);
        const contact = remote ? contactForIdentity(remote) : null;
        if (!contact) throw new Error('outbox item has no resolvable conversation');
        await client.sessionForContact(contact);
        await client.reply(channelId, item.content);
      });
      if (active) setOutboxCount(outbox.count());
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('online', flush);
      void flush();
    }
    return () => {
      active = false;
      if (typeof window !== 'undefined') window.removeEventListener('online', flush);
    };
  }, []);

  return {
    messages,
    isConnected,
    sendMessage,
    isVerified: Boolean(contact.verified),
    safetyNumber,
    remoteTyping,
    peerReadUpTo,
    sendTyping,
    sendReadReceipt,
    outboxCount,
  };
}
