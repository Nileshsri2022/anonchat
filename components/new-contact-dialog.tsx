'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { X } from 'lucide-react';

interface NewContactDialogProps {
  isOpen: boolean;
  onClose: () => void;
  contactData: any;
  onConfirm: (alias: string) => void;
}

export function NewContactDialog({
  isOpen,
  onClose,
  contactData,
  onConfirm,
}: NewContactDialogProps) {
  const [alias, setAlias] = useState('');

  const handleConfirm = () => {
    if (alias.trim()) {
      onConfirm(alias);
      setAlias('');
    }
  };

  if (!isOpen || !contactData) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-md bg-card">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-foreground">Add New Contact</h2>
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-4">
            <div className="p-3 bg-muted/50 rounded-lg border border-border">
              <p className="text-xs text-muted-foreground mb-1">Contact ID</p>
              <p className="font-mono text-xs text-foreground break-all">
                {contactData.id}
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Display Name
              </label>
              <input
                type="text"
                value={alias}
                onChange={(e) => setAlias(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleConfirm()}
                placeholder="e.g. Alice, Friend, Colleague..."
                className="w-full bg-input border border-border rounded-lg px-3 py-2 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                autoFocus
              />
            </div>

            <p className="text-xs text-muted-foreground">
              You'll be able to verify this contact's identity after the conversation is established.
            </p>

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={onClose}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={handleConfirm}
                disabled={!alias.trim()}
                className="flex-1"
              >
                Add Contact
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
