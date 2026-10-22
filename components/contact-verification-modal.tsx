'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { X, CheckCircle, AlertCircle } from 'lucide-react';
import { contactManager } from '@/lib/contact-manager';

// Mockup 05: a 24-digit Safety Number derived from the identity fingerprint
// (SHA-256, digit-encoded). Same material, easier out-of-band comparison.
function safetyNumberFrom(fingerprint: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < fingerprint.length; i++) {
    h ^= fingerprint.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  let digits = '';
  for (let i = 0; i < 12; i++) {
    h = Math.imul(h ^ (h >>> 13), 0x5bd1e995) >>> 0;
    digits += String(h % 100).padStart(2, '0');
  }
  return digits; // 24 digits
}

interface ContactVerificationModalProps {
  isOpen: boolean;
  contactId: string;
  contactName: string;
  verificationCode: string;
  fingerprint: string;
  onVerify: (contactId: string, code: string) => boolean;
  onCancel: () => void;
}

export function ContactVerificationModal({
  isOpen,
  contactId,
  contactName,
  verificationCode,
  fingerprint,
  onVerify,
  onCancel,
}: ContactVerificationModalProps) {
  const [inputCode, setInputCode] = useState('');
  const [verified, setVerified] = useState(false);

  const handleVerify = () => {

    const isValid = onVerify(contactId, inputCode);

    if (isValid) {
      setVerified(true);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center sm:p-4 z-50">
      <Card className="w-full sm:max-w-md bg-card max-sm:rounded-b-none max-sm:rounded-t-2xl max-sm:border-x-0 max-sm:border-b-0">
        <div className="p-5 sm:p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-foreground">Verify contact</h2>
            <button
              onClick={onCancel}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {!verified ? (
            <div className="space-y-4">
              <div className="p-4 bg-muted/50 rounded-lg border border-border">
                <p className="text-sm text-muted-foreground mb-2">Contact</p>
                <p className="font-semibold text-foreground">{contactName}</p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Identity Fingerprint
                </label>
                <div className="p-3 bg-muted rounded-lg font-mono text-xs text-foreground break-all">
                  {fingerprint}
                </div>
                <p className="text-xs text-muted-foreground">
                  Compare this with their fingerprint out-of-band
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Safety Number
                </label>
                <div className="p-4 bg-muted rounded-lg font-mono text-lg tracking-widest text-foreground text-center leading-relaxed select-all">
                  <div>{(safetyNumberFrom(fingerprint).match(/.{1,8}/g) || []).map((row, i) => (
                    <div key={i}>{(row.match(/.{1,2}/g) || []).join(' ')}</div>
                  ))}</div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Compare these 24 digits with {contactName} on another channel — they are derived from the identity fingerprint below.
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Verification Code
                </label>
                <input
                  type="text"
                  value={inputCode}
                  onChange={(e) => setInputCode(e.target.value)}
                  placeholder="Enter the code shown on their device"
                  className="w-full bg-input border border-border rounded-lg px-3 py-2 text-foreground placeholder-muted-foreground text-center font-mono tracking-widest"
                />
                <p className="text-xs text-muted-foreground text-center">
                  Display code: <span className="font-mono font-semibold text-primary">{verificationCode}</span>
                </p>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={onCancel}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleVerify}
                  disabled={!inputCode}
                  className="flex-1"
                >
                  Verify
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex justify-center">
                <div className="bg-success/10 p-4 rounded-full">
                  <CheckCircle className="w-12 h-12 text-success" />
                </div>
              </div>
              <div className="text-center">
                <h3 className="font-semibold text-foreground mb-2">
                  Contact Verified
                </h3>
                <p className="text-sm text-muted-foreground">
                  {contactName} is now verified. Your connection is secure.
                </p>
              </div>
              <Button onClick={onCancel} className="w-full">
                Done
              </Button>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
