'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Plus, QrCode, Shield, MessageCircle, Check, Clock } from 'lucide-react';
import { QRContactModal } from './qr-contact-modal';

interface ConversationListProps {
  conversations: any[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function ConversationList({
  conversations,
  selectedId,
  onSelect,
}: ConversationListProps) {
  const [showQRModal, setShowQRModal] = useState(false);

  return (
    <>
      <div className="w-80 bg-card border-r border-border flex flex-col h-screen">
        {/* Header */}
        <div className="p-4 border-b border-border">
          <h2 className="text-lg font-bold text-foreground mb-4">AnonChat</h2>
          <div className="flex gap-2">
            <Button size="sm" className="flex-1" variant="outline">
              <Plus className="w-4 h-4 mr-2" />
              New
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowQRModal(true)}
              title="Add contact via QR code"
            >
              <QrCode className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Conversations */}
        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground h-full flex items-center justify-center">
              <div>
                <MessageCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No conversations yet</p>
                <p className="text-xs mt-2">Click the QR icon to add a contact</p>
              </div>
            </div>
          ) : (
            <div className="space-y-1 p-2">
              {conversations.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => onSelect(conv.id)}
                  className={`w-full p-3 rounded-lg border transition text-left ${
                    selectedId === conv.id
                      ? 'bg-primary/10 border-primary'
                      : 'border-transparent hover:bg-muted/50'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-foreground text-sm">
                          {conv.name}
                        </p>
                        {conv.verified && (
                          <Check className="w-3 h-3 text-success flex-shrink-0" />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        {conv.lastMessage}
                      </p>
                    </div>
                    {conv.unread > 0 && (
                      <span className="bg-primary text-primary-foreground text-xs rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0 ml-2">
                        {conv.unread}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer Status */}
        <div className="p-4 border-t border-border bg-muted/30">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <div className="w-2 h-2 rounded-full bg-success" />
              <span>Tor connected</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Shield className="w-3 h-3" />
              <span>All connections encrypted</span>
            </div>
          </div>
        </div>
      </div>

      <QRContactModal
        isOpen={showQRModal}
        onClose={() => setShowQRModal(false)}
      />
    </>
  );
}
