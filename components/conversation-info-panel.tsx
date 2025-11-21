'use client';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { X, Check, Copy, Shield, Clock, Hash } from 'lucide-react';
import { useState } from 'react';

interface ConversationInfoPanelProps {
  isOpen: boolean;
  onClose: () => void;
  contactName: string;
  contactId: string;
  fingerprint: string;
  verified: boolean;
  sessionCreatedAt: Date;
  messageCount: number;
}

export function ConversationInfoPanel({
  isOpen,
  onClose,
  contactName,
  contactId,
  fingerprint,
  verified,
  sessionCreatedAt,
  messageCount,
}: ConversationInfoPanelProps) {
  const [copied, setCopied] = useState(false);

  const copyFingerprint = () => {
    navigator.clipboard.writeText(fingerprint);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isOpen) return null;

  return (
    <div className="w-64 bg-card border-l border-border overflow-y-auto">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <h3 className="font-semibold text-foreground">Conversation Info</h3>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-4 space-y-4">
        {/* Contact Card */}
        <Card className="p-3 bg-muted/30 border-border">
          <p className="text-xs text-muted-foreground mb-1">Contact</p>
          <p className="font-semibold text-foreground">{contactName}</p>
          {verified && (
            <div className="flex items-center gap-1 mt-2 text-xs text-success">
              <Check className="w-3 h-3" />
              Verified
            </div>
          )}
        </Card>

        {/* Session Info */}
        <div className="space-y-3">
          <div className="space-y-1">
            <p className="text-xs font-medium text-foreground flex items-center gap-2">
              <Clock className="w-3 h-3" />
              Session Created
            </p>
            <p className="text-xs text-muted-foreground">
              {sessionCreatedAt.toLocaleString()}
            </p>
          </div>

          <div className="space-y-1">
            <p className="text-xs font-medium text-foreground flex items-center gap-2">
              <Hash className="w-3 h-3" />
              Messages Encrypted
            </p>
            <p className="text-xs text-muted-foreground">{messageCount}</p>
          </div>

          <div className="space-y-1">
            <p className="text-xs font-medium text-foreground flex items-center gap-2">
              <Shield className="w-3 h-3" />
              Identity Fingerprint
            </p>
            <div
              onClick={copyFingerprint}
              className="p-2 bg-input rounded border border-border font-mono text-xs text-foreground cursor-pointer hover:bg-input/80 transition break-all"
            >
              {fingerprint.slice(0, 16)}...
            </div>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Copy className="w-3 h-3" />
              {copied ? 'Copied!' : 'Click to copy'}
            </p>
          </div>
        </div>

        {/* Security Notice */}
        <Card className="p-3 bg-success/10 border-success/20">
          <p className="text-xs text-success font-medium mb-1">Encrypted & Secure</p>
          <p className="text-xs text-success/80">
            This conversation is protected by Signal Protocol and routed through Tor.
          </p>
        </Card>
      </div>
    </div>
  );
}
