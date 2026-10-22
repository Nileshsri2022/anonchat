'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { Contact } from '@/lib/contact-manager';
import { DirectMessageSession, type DecryptedMessage, type MessageEnvelope } from '@/lib/direct-message-session';
import { generateEphemeralKeys, getOrCreateIdentityKeys } from '@/lib/crypto';
import { socketService } from '@/lib/socket-service';
import { relayAPI } from '@/lib/relay-api';

interface UseDirectMessageReturn {
  messages: DecryptedMessage[];
  isConnected: boolean;
  sendMessage: (content: string, ttl?: number) => Promise<void>;
  isVerified: boolean;
  safetyNumber: string;
}

export function useDirectMessage(contact: Contact): UseDirectMessageReturn {
  const [messages, setMessages] = useState<DecryptedMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [safetyNumber, setSafetyNumber] = useState(contact.identity.fingerprint);
  const sessionRef = useRef<DirectMessageSession | null>(null);
  const channelIdRef = useRef<string | null>(null);

  const [currentUser] = useState(() => ({
    id: typeof window !== 'undefined' ? localStorage.getItem('anonchat_userid') || `user_${Math.random().toString(36).substr(2, 9)}` : 'user_default',
    username: typeof window !== 'undefined' ? localStorage.getItem('anonchat_username') || `User${Math.floor(Math.random() * 9999)}` : 'User',
  }));

  // Disappearing messages cleanup ticker
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setMessages((prev) => prev.filter((m) => !m.expiresAt || m.expiresAt > now));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Initialize DM Session & Socket
  useEffect(() => {
    let active = true;

    async function setupSession(): Promise<(() => void) | undefined> {
      try {
        const selfIdentityKeys = await getOrCreateIdentityKeys();
        const selfPreKeys = await generateEphemeralKeys();

        const session = new DirectMessageSession({
          selfUserId: currentUser.id,
          selfIdentityKeys,
          selfPreKeys: {
            id: 1,
            publicKey: selfPreKeys.publicKey,
            privateKey: selfPreKeys.privateKey,
          },
        });

        await session.initiate(contact);
        const channelId = session.getChannelId();

        if (!active || !channelId) return;

        sessionRef.current = session;
        channelIdRef.current = channelId;
        setSafetyNumber(session.getSafetyNumber());

        // Connect Socket.IO to Pairwise Channel
        socketService.connect();
        socketService.joinRoom(channelId, currentUser.id, currentUser.username);
        setIsConnected(true);

        // Fetch any buffered messages from relay
        try {
          const buffered = await relayAPI.pollMessages(channelId);
          for (const raw of buffered) {
            if ((raw as any).header && raw.userId !== currentUser.id) {
              const decrypted = await session.receiveEnvelope(raw as unknown as MessageEnvelope);
              if (active) {
                setMessages((prev) => {
                  if (prev.some((m) => m.id === decrypted.id)) return prev;
                  return [...prev, decrypted];
                });
              }
            }
          }
        } catch {
          // Relay buffer is optional
        }

        // Listen for real-time messages on Pairwise Channel
        socketService.onMessage(channelId, async (msg: any) => {
          if (!active || !sessionRef.current) return;
          if (msg.channelId === channelId && msg.senderId !== currentUser.id && msg.header) {
            try {
              const decrypted = await sessionRef.current.receiveEnvelope(msg as MessageEnvelope);
              setMessages((prev) => {
                if (prev.some((m) => m.id === decrypted.id)) return prev;
                return [...prev, decrypted];
              });
            } catch (err) {
              console.error('Failed to decrypt incoming DM envelope:', err);
            }
          }
        });

        return () => {
          socketService.leaveRoom(channelId, currentUser.id);
        };
      } catch (err) {
        console.error('Failed to establish Direct Message session:', err);
        return undefined;
      }
    }

    const cleanupPromise = setupSession();

    return () => {
      active = false;
      cleanupPromise.then((cleanup) => {
        if (typeof cleanup === 'function') cleanup();
      });
    };
  }, [contact, currentUser]);

  const sendMessage = useCallback(
    async (content: string, ttl?: number) => {
      if (!sessionRef.current || !channelIdRef.current) {
        throw new Error('Direct message session is not initialized');
      }

      const envelope = await sessionRef.current.sendMessage(content, { ttl });

      // Append locally
      const localMsg: DecryptedMessage = {
        id: `local_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        channelId: channelIdRef.current,
        senderId: currentUser.id,
        content,
        timestamp: envelope.timestamp,
        ttl: envelope.ttl,
        expiresAt: envelope.expiresAt,
      };
      setMessages((prev) => [...prev, localMsg]);

      // Broadcast over Socket.IO Pairwise Channel
      socketService.sendMessage(channelIdRef.current, envelope);

      // Also publish to relay REST endpoint for offline/buffering
      try {
        await relayAPI.sendMessage({
          id: envelope.channelId + '_' + envelope.timestamp,
          roomId: channelIdRef.current,
          userId: currentUser.id,
          username: currentUser.username,
          encryptedContent: envelope.ciphertext,
          iv: envelope.iv,
          timestamp: envelope.timestamp,
          expiresAt: envelope.expiresAt,
          ...(envelope as any),
        });
      } catch {
        // Broadcast over socket already succeeded
      }
    },
    [currentUser]
  );

  return {
    messages,
    isConnected,
    sendMessage,
    isVerified: Boolean(contact.verified),
    safetyNumber,
  };
}
