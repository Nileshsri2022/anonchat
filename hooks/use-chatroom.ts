// Hook for managing chatroom state and real-time messaging - v2.0
// Cache bust: 2024-01-19

import { useState, useEffect, useCallback, useRef } from 'react';
import { relayAPI, RelayMessage } from '@/lib/relay-api';
import { roomEncryption } from '@/lib/room-encryption';
import { socketService } from '@/lib/socket-service';

export interface Message {
  id: string;
  userId: string;
  username: string;
  content: string;
  timestamp: Date;
  encrypted: boolean;
  ip?: string; // Anonymous IP from SOCKS proxy
  expiresAt?: number; // For disappearing messages
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

export function useChatroom(roomId: string, roomName: string) {
  const [messages, setMessages] = useState<Message[]>([]);
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
        // Derive room key
        await roomEncryption.deriveRoomKey(roomId, 'shared-secret');

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
        setMessages([{
          id: 'sys_welcome',
          userId: 'system',
          username: 'System',
          content: `Welcome to ${roomName}! Share the room ID with others to invite them. All messages are encrypted via AES-256-GCM and routed through Tor for enhanced anonymity.`,
          timestamp: new Date(),
          encrypted: true,
        }]);

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

  // Clean up expired disappearing messages from local state
  useEffect(() => {
    const cleanupInterval = setInterval(() => {
      const now = Date.now();
      setMessages(prev => {
        const filtered = prev.filter(msg => !msg.expiresAt || msg.expiresAt > now);
        if (filtered.length !== prev.length) {
          console.log(`🗑️ Cleaned ${prev.length - filtered.length} expired message(s) from UI`);
        }
        return filtered.length !== prev.length ? filtered : prev;
      });
    }, 5000); // Check every 5 seconds

    return () => clearInterval(cleanupInterval);
  }, []);

  // WebSocket or Polling for real-time messages
  useEffect(() => {
    if (!isConnected) return;

    const handleNewMessage = async (msg: RelayMessage) => {
      // Skip messages from current user
      if (msg.userId === currentUser.id) return;

      try {
        const decrypted = await roomEncryption.decrypt({
          ciphertext: msg.encryptedContent,
          iv: msg.iv,
          tag: '',
        });

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
      socketService.connect()
        .then(() => {
          console.log('🔌 Using WebSocket for real-time updates');
          socketService.joinRoom(roomId, currentUser.id, currentUser.username);
          socketService.onMessage(roomId, handleNewMessage);
        })
        .catch((err) => {
          console.warn('🔌 WebSocket failed, falling back to polling:', err.message);
          setUseWebSocket(false);
        });

      return () => {
        socketService.leaveRoom(roomId, currentUser.id);
      };
    } else {
      // Fallback to polling
      console.log('📡 Using polling for real-time updates');
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
