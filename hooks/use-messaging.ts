'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { messageEncryption, MessageEncryption } from '@/lib/message-encryption';
import { createRelayClient, RelayApiClient } from '@/lib/api-client';

export interface UseMessagingOptions {
  clientId: string;
  sessionId: string;
  onMessageReceived?: (message: any) => void;
}

export function useMessaging(options: UseMessagingOptions) {
  const [messages, setMessages] = useState<any[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clientRef = useRef<RelayApiClient | null>(null);
  const pollingRef = useRef<NodeJS.Timer | null>(null);

  // Initialize API client
  useEffect(() => {
    clientRef.current = createRelayClient(options.clientId);
  }, [options.clientId]);

  // Start polling for messages
  useEffect(() => {
    const startPolling = async () => {
      if (!clientRef.current) return;

      const isConnected = await clientRef.current.getTorStatus();
      setIsConnected(isConnected);

      pollingRef.current = setInterval(async () => {
        try {
          const relayMessages = await clientRef.current!.pollMessages();
          
          for (const msg of relayMessages) {
            try {
              const decrypted = await messageEncryption.decryptMessage(
                options.sessionId,
                {
                  ciphertext: msg.payload,
                  iv: '',
                  tag: '',
                  messageNumber: 0,
                  sessionId: options.sessionId,
                }
              );

              const newMessage = {
                id: Date.now().toString(),
                content: decrypted.plaintext,
                sender: 'other',
                timestamp: new Date(),
                encrypted: true,
                verified: true,
              };

              setMessages(prev => [...prev, newMessage]);
              options.onMessageReceived?.(newMessage);
            } catch (decryptError) {
              console.error('Failed to decrypt message:', decryptError);
            }
          }
        } catch (pollError) {
          console.error('Polling error:', pollError);
        }
      }, 3000); // Poll every 3 seconds
    };

    startPolling();

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, [options.clientId, options.sessionId]);

  const sendMessage = useCallback(async (recipient: string, content: string) => {
    if (!clientRef.current) return;

    setIsSending(true);
    setError(null);

    try {
      // Encrypt message
      const encrypted = await messageEncryption.encryptMessage(
        options.sessionId,
        content
      );

      // Send via relay
      const response = await clientRef.current.sendMessage(
        recipient,
        JSON.stringify(encrypted)
      );

      if (!response.success) {
        throw new Error(response.error || 'Failed to send message');
      }

      // Add to local messages
      const newMessage = {
        id: Date.now().toString(),
        content,
        sender: 'user',
        timestamp: new Date(),
        encrypted: true,
        status: 'sent',
      };

      setMessages(prev => [...prev, newMessage]);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMsg);
      console.error('Send error:', err);
    } finally {
      setIsSending(false);
    }
  }, [options.clientId, options.sessionId]);

  return {
    messages,
    isConnected,
    isSending,
    error,
    sendMessage,
  };
}
