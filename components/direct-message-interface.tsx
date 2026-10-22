'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import type { Contact } from '@/lib/contact-manager';
import { useDirectMessage } from '@/hooks/use-direct-message';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Shield, ShieldAlert, ArrowLeft, Send, Timer, Check, Copy, User } from 'lucide-react';
import { TorCircuitDisplay } from '@/components/tor-circuit-display';
import { TorStatusIndicator } from '@/components/tor-status-indicator';
import { ContactVerificationModal } from '@/components/contact-verification-modal';
import { contactManager } from '@/lib/contact-manager';

interface DirectMessageInterfaceProps {
  contact: Contact;
  onClose: () => void;
  onContactVerified?: () => void;
}

export function DirectMessageInterface({ contact, onClose, onContactVerified }: DirectMessageInterfaceProps) {
  const [inputText, setInputText] = useState('');
  const [ttlMs, setTtlMs] = useState<number>(0);
  const [copiedFingerprint, setCopiedFingerprint] = useState(false);
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { messages, isConnected, sendMessage, isVerified, safetyNumber } = useDirectMessage(contact);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = useCallback(async () => {
    if (!inputText.trim()) return;
    const text = inputText;
    setInputText('');
    await sendMessage(text, ttlMs > 0 ? ttlMs : undefined);
  }, [inputText, ttlMs, sendMessage]);

  const handleCopySafetyNumber = useCallback(() => {
    navigator.clipboard.writeText(safetyNumber);
    setCopiedFingerprint(true);
    setTimeout(() => setCopiedFingerprint(false), 2000);
  }, [safetyNumber]);

  return (
    <div className="flex-1 flex flex-col bg-background h-full overflow-hidden">
      {/* Tor Circuit Display */}
      <div className="p-4 border-b border-border/50">
        <TorCircuitDisplay />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/20">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onClose} title="Back to rooms">
            <ArrowLeft className="w-5 h-5 text-muted-foreground" />
          </Button>

          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <User className="w-5 h-5 text-primary" />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-foreground text-base">{contact.alias}</h2>
              {isVerified ? (
                <Badge variant="outline" className="text-xs text-green-500 border-green-500/30 bg-green-500/10">
                  <Shield className="w-3 h-3 mr-1" />
                  Verified
                </Badge>
              ) : (
                <Badge variant="outline" className="text-xs text-yellow-500 border-yellow-500/30 bg-yellow-500/10">
                  <ShieldAlert className="w-3 h-3 mr-1" />
                  Unverified
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <button
                onClick={handleCopySafetyNumber}
                className="hover:text-foreground transition-colors font-mono flex items-center gap-1"
                title="Click to copy safety number fingerprint"
              >
                Safety No: {safetyNumber.slice(0, 14)}...
                {copiedFingerprint ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
              </button>
              <span>•</span>
              <span className={isConnected ? 'text-green-500' : 'text-yellow-500'}>
                {isConnected ? 'E2EE Ratchet Active' : 'Connecting...'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {!isVerified && (
            <Button
              size="sm"
              variant="outline"
              className="text-xs border-yellow-500/40 text-yellow-500 hover:bg-yellow-500/10"
              onClick={() => setShowVerificationModal(true)}
            >
              Verify Contact
            </Button>
          )}
          <TorStatusIndicator />
        </div>
      </div>

      {/* Unverified Security Warning Banner */}
      {!isVerified && (
        <div className="bg-yellow-500/10 border-b border-yellow-500/20 px-6 py-2.5 flex items-center justify-between text-xs text-yellow-600 dark:text-yellow-400">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 flex-shrink-0" />
            <span>
              <strong>Unverified Contact:</strong> Messages are end-to-end encrypted with Double Ratchet, but you have not verified their safety number out-of-band to prevent MITM.
            </span>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="text-xs underline h-auto p-0 hover:bg-transparent text-yellow-600 dark:text-yellow-400"
            onClick={() => setShowVerificationModal(true)}
          >
            Verify Safety Number
          </Button>
        </div>
      )}

      {/* Message List */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        <div className="text-center my-4">
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs bg-muted text-muted-foreground">
            <Shield className="w-3.5 h-3.5 text-primary" />
            Direct message session secured with X3DH & Double Ratchet
          </div>
        </div>

        {messages.map((msg) => {
          const isMe = msg.senderId !== contact.identity.id;
          return (
            <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
              <div
                className={`max-w-[70%] rounded-2xl px-4 py-2.5 shadow-sm text-sm ${
                  isMe
                    ? 'bg-primary text-primary-foreground rounded-br-none'
                    : 'bg-muted/70 text-foreground rounded-bl-none border border-border/40'
                }`}
              >
                <p className="break-words leading-relaxed">{msg.content}</p>
                <div
                  className={`flex items-center gap-1.5 text-[10px] mt-1 ${
                    isMe ? 'text-primary-foreground/70' : 'text-muted-foreground'
                  }`}
                >
                  <span>{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  {msg.ttl && msg.ttl > 0 && (
                    <span className="flex items-center gap-0.5 text-yellow-400" title="Disappearing message">
                      <Timer className="w-3 h-3" />
                      {Math.max(1, Math.ceil(((msg.expiresAt || 0) - Date.now()) / 1000))}s
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Bar */}
      <div className="p-4 border-t border-border bg-card/50">
        <div className="flex items-center gap-2">
          {/* TTL selector */}
          <select
            value={ttlMs}
            onChange={(e) => setTtlMs(Number(e.target.value))}
            className="text-xs bg-muted border border-border rounded-md px-2.5 py-2 text-foreground focus:outline-none"
            title="Disappearing Message Timer"
          >
            <option value={0}>Timer: Off</option>
            <option value={30 * 1000}>30s</option>
            <option value={5 * 60 * 1000}>5m</option>
            <option value={60 * 60 * 1000}>1h</option>
            <option value={24 * 60 * 60 * 1000}>24h</option>
          </select>

          <Input
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
            placeholder={`Send encrypted message to ${contact.alias}...`}
            className="flex-1 bg-background"
          />

          <Button onClick={handleSend} disabled={!inputText.trim()} size="icon">
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Verification Modal */}
      {showVerificationModal && (
        <ContactVerificationModal
          contactId={contact.id}
          contactName={contact.alias}
          verificationCode={contact.verificationCode}
          fingerprint={contact.identity.fingerprint}
          isOpen={showVerificationModal}
          onCancel={() => setShowVerificationModal(false)}
          onVerify={(contactId, code) => {
            const success = contactManager.verifyContact(contactId, code);
            if (success) {
              setShowVerificationModal(false);
              if (onContactVerified) onContactVerified();
            }
            return success;
          }}
        />
      )}
    </div>
  );
}
