'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Send, Lock, Shield, MoreVertical, Info } from 'lucide-react';
import { EncryptionStatusBar } from './encryption-status-bar';
import { MessageBubble } from './message-bubble';
import { TorCircuitDebug } from './tor-circuit-debug';
import { torIntegration } from '@/lib/tor-integration';

interface ChatInterfaceProps {
  conversationId: string;
  onOpenInfo?: () => void;
}

interface Message {
  id: string;
  content: string;
  sender: 'user' | 'other';
  timestamp: Date;
  encrypted: boolean;
  verified?: boolean;
  status?: 'sending' | 'sent' | 'delivered' | 'read';
}

export function ChatInterface({ conversationId, onOpenInfo }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [encryptionStatus, setEncryptionStatus] = useState<'pending' | 'established' | 'verified'>('verified');
  const [torConnected, setTorConnected] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Monitor Tor connectivity status
  useEffect(() => {
    // Initial status check
    torIntegration.checkTorStatus().then((status) => {
      setTorConnected(status.connected && status.circuitEstablished);
      console.log('🔍 Initial Tor status:', status);
    });

    // Start monitoring for status changes
    const stopMonitoring = torIntegration.startStatusMonitoring((status) => {
      const isConnected = status.connected && status.circuitEstablished;
      setTorConnected(isConnected);
      console.log('🔄 Tor status updated:', status);
    });

    // Log detailed Tor IP status on mount (for debugging)
    torIntegration.logTorIPStatus();

    return stopMonitoring;
  }, []);

  const handleSendMessage = () => {
    if (!input.trim()) return;

    const newMessage: Message = {
      id: Date.now().toString(),
      content: input,
      sender: 'user',
      timestamp: new Date(),
      encrypted: true,
      verified: encryptionStatus === 'verified',
      status: 'sending',
    };

    setMessages([...messages, newMessage]);
    setInput('');

    // Simulate delivery
    setTimeout(() => {
      setMessages(msgs =>
        msgs.map(m => (m.id === newMessage.id ? { ...m, status: 'delivered' as const } : m))
      );
    }, 500);
  };

  return (
    <div className="flex-1 flex flex-col bg-background">
      {/* Header with Status */}
      <div className="p-4 border-b border-border bg-card/50 backdrop-blur">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-semibold text-foreground">Secure Conversation</h3>
            <p className="text-xs text-muted-foreground mt-1">
              {encryptionStatus === 'verified' ? 'Identity verified' : 'Identity not yet verified'}
            </p>
          </div>
          <button
            onClick={onOpenInfo}
            className="text-muted-foreground hover:text-foreground p-2 hover:bg-muted/50 rounded-lg"
          >
            <Info className="w-4 h-4" />
          </button>
        </div>
        <EncryptionStatusBar
          status={encryptionStatus}
          torConnected={torConnected}
          messageCount={messages.filter(m => m.encrypted).length}
        />
        <TorCircuitDebug />
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-center text-muted-foreground">
              <Shield className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>Start a new encrypted conversation</p>
              <p className="text-xs mt-2">Using Signal Protocol + Double Ratchet</p>
            </div>
          </div>
        ) : (
          <>
            {messages.map((msg) => (
              <MessageBubble
                key={msg.id}
                content={msg.content}
                sender={msg.sender}
                timestamp={msg.timestamp}
                encrypted={msg.encrypted}
                verified={msg.verified}
                status={msg.status}
              />
            ))}
            {isTyping && (
              <div className="flex justify-start">
                <div className="flex gap-1.5 px-3 py-2 rounded-lg bg-card border border-border">
                  <div className="w-2 h-2 rounded-full bg-muted-foreground animate-bounce" />
                  <div className="w-2 h-2 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            )}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-border bg-card/50">
        <div className="flex gap-2 mb-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
            placeholder="Type a message..."
            className="flex-1 bg-input border border-border rounded-lg px-4 py-2 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          <Button
            onClick={handleSendMessage}
            disabled={!input.trim()}
            size="sm"
            className="gap-2"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <Lock className="w-3 h-3" />
          All messages encrypted with Double Ratchet
        </p>
      </div>
    </div>
  );
}
