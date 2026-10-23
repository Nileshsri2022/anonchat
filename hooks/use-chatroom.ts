// Hook for managing chatroom state and real-time messaging - v2.0
// Cache bust: 2024-01-19

import { useState, useEffect, useCallback, useRef } from 'react';
import { relayAPI, RelayMessage } from '@/lib/relay-api';
import { roomEncryption } from '@/lib/room-encryption';
import { socketService } from '@/lib/socket-service';
import type { StoredMessage } from '@/lib/message-storage';
import { getEncryptedHistoryStorage } from '@/lib/instances';
import {
  RoomSenderKeyCoordinator,
  registerRoomCoordinator,
  roomCoordinator,
  type IntroPayload,
} from '@/lib/room-sender-keys';
import type { IdentityBundle } from '@/lib/identity-bundle';
import type { Contact } from '@/lib/contact-manager';
import { getDmClient } from '@/lib/instances';

export interface Message {
  id: string;
  userId: string;
  username: string;
  content: string;
  timestamp: Date;
  encrypted: boolean;
  ip?: string; // Anonymous IP from SOCKS proxy
  expiresAt?: number; // For disappearing messages
  /** Sender-key rooms: the sender's pairwise SAS state (Unverified Badge, ADR-0008). */
  verified?: boolean;
}

export interface RoomUser {
  id: string;
  username: string;
  color: string;
  online: boolean;
  joinedAt: Date;
  ip?: string; // Anonymous IP from SOCKS proxy
}

const USER_COLORS = [
  'text-blue-400',
  'text-green-400',
  'text-yellow-400',
  'text-purple-400',
  'text-pink-400',
  'text-cyan-400',
  'text-orange-400',
  'text-indigo-400',
];

export function useChatroom(roomId: string, roomName: string, passphrase?: string, roomKeyB64?: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const coordinatorRef = useRef<RoomSenderKeyCoordinator | null>(null);
  const introSentRef = useRef(false);
  const [users, setUsers] = useState<RoomUser[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [useWebSocket, setUseWebSocket] = useState(true); // Try WebSocket first
  const [messageTTL, setMessageTTL] = useState(0); // 0 = off, or ms until expiry
  const [currentUser] = useState(() => ({
    id: `user_${Math.random().toString(36).substr(2, 9)}`,
    username: localStorage.getItem('anonchat_username') || `User${Math.floor(Math.random() * 9999)}`,
    color: USER_COLORS[Math.floor(Math.random() * USER_COLORS.length)],
  }));
  const lastMessageIdRef = useRef<string | undefined>(undefined);

  // Initialize room
  useEffect(() => {
    const initRoom = async () => {
      try {
        // Room key: random-key Rooms import their Invite-carried key (ADR-0003);
        // passphrase Rooms derive from the Room Passphrase.
        if (roomKeyB64) {
          await roomEncryption.importRoomKey(roomKeyB64);
          // Sender-key room (ADR-0008): the Room Key only carries Intros;
          // content rides pairwise-distributed Sender-Key chains.
          const existing = roomCoordinator(roomId);
          if (!existing) {
            const client = await getDmClient();
            const bundle = await client.exportOwnBundle();
            const coordinator = await RoomSenderKeyCoordinator.create(
              roomId,
              bundle.identityPublicKeySpkiB64,
              bundle.identitySigningPublicKeySpkiB64,
              typeof window !== 'undefined'
                ? localStorage.getItem('anonchat_display_name') ?? undefined
                : undefined,
            );
            coordinator.setSelfBundle(bundle);
            registerRoomCoordinator(coordinator);
          }
          coordinatorRef.current = roomCoordinator(roomId) ?? null;
        } else {
          await roomEncryption.deriveKeyFromPassphrase(roomId, passphrase ?? '');
          coordinatorRef.current = null;
        }

        // Join room
        const joinResult = await relayAPI.joinRoom(roomId, currentUser.id, currentUser.username);

        // Add current user with anonymous data
        const newUser: RoomUser = {
          id: joinResult.userId,
          username: currentUser.username,
          color: currentUser.color,
          online: true,
          joinedAt: new Date(),
          ip: joinResult.userIP,
        };
        setUsers([newUser]);

        // Welcome message
        const welcomeMsg: Message = {
          id: 'sys_welcome',
          userId: 'system',
          username: 'System',
          content: `Welcome to ${roomName}! Share the room ID with others to invite them. All messages are encrypted via AES-256-GCM and routed through Tor for enhanced anonymity.`,
          timestamp: new Date(),
          encrypted: true,
        };

        // Load stored messages (encrypted at rest when a storage key exists, ADR-0004)
        try {
          const historyStore = await getEncryptedHistoryStorage();
          const storedMessages = historyStore
            ? ((await historyStore.getMessagesByRoom(roomId)) as StoredMessage[])
            : [];
          if (storedMessages.length > 0) {
            const loadedMessages: Message[] = storedMessages.map(m => ({
              id: m.id,
              userId: m.userId,
              username: m.username,
              content: m.content,
              timestamp: new Date(m.timestamp),
              encrypted: m.encrypted,
              ip: m.ip,
              expiresAt: m.expiresAt,
            }));
            setMessages([welcomeMsg, ...loadedMessages]);
          } else {
            setMessages([welcomeMsg]);
          }
        } catch (e) {
          console.warn('Failed to load stored messages:', e);
          setMessages([welcomeMsg]);
        }

        setIsConnected(true);
      } catch (error) {
        console.error('[v0] Init room error:', error);
        setMessages([{
          id: 'sys_error',
          userId: 'system',
          username: 'System',
          content: 'Failed to connect to room. Please try again.',
          timestamp: new Date(),
          encrypted: false,
        }]);
      }
    };

    initRoom();

    return () => {
      relayAPI.leaveRoom(roomId, currentUser.id);
    };
  }, [roomId, roomName, currentUser.id, currentUser.username, currentUser.color]);

  // Clean up expired disappearing messages from local state and IndexedDB
  useEffect(() => {
    const cleanupInterval = setInterval(async () => {
      const now = Date.now();
      setMessages(prev => {
        const filtered = prev.filter(msg => !msg.expiresAt || msg.expiresAt > now);
        if (filtered.length !== prev.length) {
        }
        return filtered.length !== prev.length ? filtered : prev;
      });

      // Hard-delete expired disappearing messages from local storage
      try {
        const store = await getEncryptedHistoryStorage();
        const deleted = store ? await store.purgeExpired(roomId) : 0;
        if (deleted > 0) {
        }
      } catch {
        // Ignore errors
      }
    }, 5000); // Check every 5 seconds

    return () => clearInterval(cleanupInterval);
  }, []);

  // WebSocket or Polling for real-time messages
  useEffect(() => {
    if (!isConnected) return;

    const handleNewMessage = async (msg: RelayMessage) => {
      // Skip messages from current user
      if (msg.userId === currentUser.id) return;

      const coordinator = coordinatorRef.current;

      // Sender-key room content (ADR-0008): per-sender chain, sender-authenticated
      if (coordinator && msg.encryptedContent.startsWith('{"t":"msg"')) {
        try {
          const { text, from, verified } = await coordinator.decryptContent(msg.encryptedContent);
          const info = coordinator.memberInfo(from);
          const username = info?.displayName || `anon-${from.slice(0, 6)}`;
          setMessages((prev) => [
            ...prev,
            {
              id: msg.id,
              userId: from,
              username,
              content: text,
              timestamp: new Date(msg.timestamp),
              encrypted: true,
              expiresAt: msg.expiresAt,
              verified,
            },
          ]);
        } catch (e) {
          console.warn('[room] sender-chain message skipped:', (e as Error).message);
        }
        return;
      }

      try {
        const decrypted = await roomEncryption.decrypt({
          ciphertext: msg.encryptedContent,
          iv: msg.iv,
          tag: '',
        });

        // Room-Key-encrypted Intro (one per member): register + open the pairwise
        // DM + distribute our Sender Key. Intros are never chat content.
        if (coordinator && decrypted.startsWith('{"t":"intro"')) {
          try {
            const intro = JSON.parse(decrypted) as IntroPayload;
            coordinator.onIntroPayload(decrypted);
            const bundle: IdentityBundle | null = coordinator.introBundleOf(decrypted);
            if (bundle) {
              const client = await getDmClient();
              const contact: Contact = {
                id: `roomintro_${intro.bundle.identityPublicKeySpkiB64.slice(0, 12)}`,
                alias: intro.name || `anon-${intro.bundle.identityPublicKeySpkiB64.slice(0, 6)}`,
                identity: {
                  id: `roomintro_user_${intro.bundle.identityPublicKeySpkiB64.slice(0, 8)}`,
                  identityPublicKey: bundle.identityPublicKeySpkiB64,
                  preKeyPublic: bundle.preKeyPublicSpkiB64,
                  preKeyId: bundle.preKeyId,
                  fingerprint: bundle.identityPublicKeySpkiB64.slice(0, 16),
                  identitySigningPublicKey: bundle.identitySigningPublicKeySpkiB64,
                  preKeySignature: bundle.preKeySignatureB64,
                  pqKemPublicB64: bundle.pqKemPublicB64,
                  pqKemSignatureB64: bundle.pqKemSignatureB64,
                },
                verified: false,
                verificationCode: '',
                addedAt: new Date(),
                encryptionStatus: 'established',
              };
              await client.channelForIntro(contact);
              const dist = await coordinator.distributionFor(bundle.identityPublicKeySpkiB64);
              await client.sendToContact(contact, dist);
              if (!introSentRef.current) {
                introSentRef.current = true;
                const myIntro = await roomEncryption.encrypt(JSON.stringify(coordinator.makeIntroPayload()));
                await relayAPI.sendMessage({
                  id: `intro_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                  roomId,
                  userId: currentUser.id,
                  username: currentUser.username,
                  encryptedContent: myIntro.ciphertext,
                  iv: myIntro.iv,
                  timestamp: Date.now(),
                });
              }
            }
          } catch (e) {
            console.warn('[room] intro handling skipped:', (e as Error).message);
          }
          return;
        }

        // Add user if not exists
        setUsers(prev => {
          const exists = prev.some(u => u.id === msg.userId);
          if (!exists) {
            return [...prev, {
              id: msg.userId,
              username: msg.username,
              color: USER_COLORS[prev.length % USER_COLORS.length],
              online: true,
              joinedAt: new Date(msg.timestamp),
            }];
          }
          return prev;
        });

        const newMessage: Message = {
          id: msg.id,
          userId: msg.userId,
          username: msg.username,
          content: decrypted,
          timestamp: new Date(msg.timestamp),
          encrypted: true,
          ip: msg.ip,
          expiresAt: msg.expiresAt,
        };

        // Persist (encrypted at rest when a storage key exists, ADR-0004)
        getEncryptedHistoryStorage().then((store) =>
          store?.saveMessage({
            id: msg.id,
            roomId: msg.roomId,
            userId: msg.userId,
            username: msg.username,
            content: decrypted,
            timestamp: msg.timestamp,
            encrypted: true,
            ip: msg.ip,
            expiresAt: msg.expiresAt,
          }).catch((e: unknown) => console.warn('Failed to save message:', e)),
        );

        setMessages(prev => [...prev, newMessage]);
      } catch (error) {
        console.error('[v0] Decrypt error:', error);
      }
    };

    // Handle batch messages from polling
    const handleNewMessages = async (relayMessages: RelayMessage[]) => {
      for (const msg of relayMessages) {
        await handleNewMessage(msg);
      }
    };

    // Try WebSocket first
    if (useWebSocket) {
      // `connect()` resolves asynchronously: without this guard a handler can be
      // registered after unmount and then never cleaned up.
      let cancelled = false;

      socketService.connect()
        .then(() => {
          if (cancelled) return;
          socketService.joinRoom(roomId, currentUser.id, currentUser.username);
          socketService.onMessage(roomId, handleNewMessage);
        })
        .catch((err) => {
          if (cancelled) return;
          console.warn('🔌 WebSocket failed, falling back to polling:', err.message);
          setUseWebSocket(false);
        });

      return () => {
        cancelled = true;
        socketService.leaveRoom(roomId, currentUser.id);
      };
    } else {
      // Fallback to polling
      relayAPI.startPolling(roomId, handleNewMessages, lastMessageIdRef.current);

      return () => {
        relayAPI.stopPolling(roomId);
      };
    }
  }, [isConnected, roomId, currentUser.id, currentUser.username, useWebSocket]);

  // Send message
  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || !isConnected) return;

    try {
      const encrypted = await roomEncryption.encrypt(content.trim());

      const now = Date.now();
      const relayMessage: RelayMessage = {
        id: `msg_${now}_${Math.random().toString(36).substr(2, 9)}`,
        roomId,
        userId: currentUser.id,
        username: currentUser.username,
        encryptedContent: encrypted.ciphertext,
        iv: encrypted.iv,
        timestamp: now,
        ...(messageTTL > 0 && { expiresAt: now + messageTTL }),
      };

      const sendResult = await relayAPI.sendMessage(relayMessage);

      // Also broadcast via WebSocket for real-time delivery
      if (useWebSocket && socketService.isConnected()) {
        socketService.sendMessage(roomId, relayMessage);
      }

      const newMessage: Message = {
        id: sendResult.messageId,
        userId: currentUser.id,
        username: currentUser.username,
        content: content.trim(),
        timestamp: new Date(),
        encrypted: true,
        ip: sendResult.sentFrom,
        ...(messageTTL > 0 && { expiresAt: now + messageTTL }),
      };

      // Persist (encrypted at rest when a storage key exists, ADR-0004)
      getEncryptedHistoryStorage().then((store) =>
        store?.saveMessage({
          id: sendResult.messageId,
          roomId,
          userId: currentUser.id,
          username: currentUser.username,
          content: content.trim(),
          timestamp: now,
          encrypted: true,
          ip: sendResult.sentFrom,
          expiresAt: messageTTL > 0 ? now + messageTTL : undefined,
        }).catch((e: unknown) => console.warn('Failed to save message:', e)),
      );

      setMessages(prev => [...prev, newMessage]);
      lastMessageIdRef.current = relayMessage.id;
    } catch (error) {
      console.error('[v0] Send error:', error);

      setMessages(prev => [...prev, {
        id: `error_${Date.now()}`,
        userId: 'system',
        username: 'System',
        content: 'Failed to send message. Please try again.',
        timestamp: new Date(),
        encrypted: false,
      }]);
    }
  }, [isConnected, roomId, currentUser.id, currentUser.username, messageTTL]);

  return {
    messages,
    users,
    currentUser,
    isConnected,
    sendMessage,
    messageTTL,
    setMessageTTL,
  };
}
