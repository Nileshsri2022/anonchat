'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Shield, Info, Users, Send, Copy, Check, QrCode, Timer } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useChatroom } from '@/hooks/use-chatroom';
import { QRContactModal } from '@/components/qr-contact-modal';
import { TorCircuitDisplay } from '@/components/tor-circuit-display';
import { TorStatusIndicator } from '@/components/tor-status-indicator';

interface ChatroomInterfaceProps {
  roomId: string;
  roomName: string;
  onOpenInfo: () => void;
  onLeaveRoom: () => void;
}

export function ChatroomInterface({ roomId, roomName, onOpenInfo, onLeaveRoom }: ChatroomInterfaceProps) {
  const [message, setMessage] = useState('');
  const [copied, setCopied] = useState(false);
  const [showQRModal, setShowQRModal] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { messages, users, currentUser, isConnected, sendMessage, messageTTL, setMessageTTL } = useChatroom(roomId, roomName);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = useCallback(() => {
    if (message.trim()) {
      sendMessage(message);
      setMessage('');
    }
  }, [message, sendMessage]);

  const copyRoomId = useCallback(() => {
    navigator.clipboard.writeText(roomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [roomId]);

  return (
    <div className="flex-1 flex flex-col bg-background">
      {/* Tor Circuit Display - Always at top */}
      <div className="p-4 border-b border-border/50">
        <TorCircuitDisplay />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/20">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Users className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="font-semibold text-foreground">{roomName}</h2>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{users.filter(u => u.online).length} online</span>
              <span>•</span>
              <button
                onClick={copyRoomId}
                className="flex items-center gap-1 hover:text-foreground transition-colors"
              >
                {roomId.slice(0, 8)}...
                {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              </button>
              {!isConnected && (
                <>
                  <span>•</span>
                  <span className="text-yellow-500">Connecting...</span>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <TorStatusIndicator />
          <Badge variant="secondary" className="gap-1">
            <Shield className="w-3 h-3" />
            E2E Encrypted
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowQRModal(true)}
            title="Add contact"
          >
            <QrCode className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={onOpenInfo}>
            <Info className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={onLeaveRoom}>
            Leave Room
          </Button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {messages.map((msg) => {
          const isCurrentUser = msg.userId === currentUser.id;
          const isSystem = msg.userId === 'system';
          const user = users.find(u => u.id === msg.userId);
          const userColor = user?.color || 'text-foreground';

          if (isSystem) {
            return (
              <div key={msg.id} className="flex justify-center">
                <div className="bg-muted/50 px-4 py-2 rounded-full text-xs text-muted-foreground max-w-md text-center">
                  {msg.content}
                </div>
              </div>
            );
          }

          return (
            <div key={msg.id} className={`flex gap-3 ${isCurrentUser ? 'justify-end' : ''}`}>
              {!isCurrentUser && (
                <div className={`w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-semibold ${userColor}`}>
                  {msg.username[0]}
                </div>
              )}
              <div className={`flex flex-col gap-1 max-w-md ${isCurrentUser ? 'items-end' : ''}`}>
                {!isCurrentUser && (
                  <span className={`text-xs font-semibold ${userColor}`}>
                    {msg.username}
                  </span>
                )}
                <div
                  className={`px-4 py-2 rounded-2xl ${isCurrentUser
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-foreground'
                    }`}
                >
                  <p className="text-sm break-words">{msg.content}</p>
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <span>{msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  {msg.ip && <span>from {msg.ip}</span>}
                  {msg.encrypted && <Shield className="w-3 h-3" />}
                </div>
              </div>
              {isCurrentUser && (
                <div className={`w-8 h-8 rounded-full bg-primary flex items-center justify-center text-xs font-semibold text-primary-foreground`}>
                  {msg.username[0]}
                </div>
              )}
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-6 py-4 border-t border-border bg-muted/20">
        <div className="flex gap-2">
          <Input
            placeholder={isConnected ? "Type a message..." : "Connecting..."}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
            className="flex-1"
            disabled={!isConnected}
          />
          <select
            value={messageTTL}
            onChange={(e) => setMessageTTL(Number(e.target.value))}
            className="px-2 py-1 text-xs rounded-md border border-border bg-background"
            title="Disappearing messages"
          >
            <option value={0}>∞ Off</option>
            <option value={30000}>30s</option>
            <option value={300000}>5m</option>
            <option value={3600000}>1h</option>
            <option value={86400000}>24h</option>
          </select>
          <Button onClick={handleSendMessage} disabled={!message.trim() || !isConnected}>
            <Send className="w-4 h-4" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
          <Shield className="w-3 h-3" />
          Messages encrypted with AES-256-GCM • Routed via Tor
          {messageTTL > 0 && (
            <>
              {' '}• <Timer className="w-3 h-3" /> Disappearing in {messageTTL / 1000}s
            </>
          )}
        </p>
      </div>

      <QRContactModal
        isOpen={showQRModal}
        onClose={() => setShowQRModal(false)}
      />
    </div>
  );
}
