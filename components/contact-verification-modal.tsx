'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { X, CheckCircle, AlertCircle } from 'lucide-react';
import { contactManager } from '@/lib/contact-manager';

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
    console.log('🔍 Verification modal - Contact ID:', contactId);
    console.log('🔍 Verification modal - Input code:', inputCode);
    console.log('🔍 Verification modal - Expected code:', verificationCode);

    const isValid = onVerify(contactId, inputCode);
    console.log('🔍 Verification modal - Is valid:', isValid);

    if (isValid) {
      setVerified(true);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-md bg-card">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-foreground">Verify Contact</h2>
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
                <div className="p-3 bg-input rounded-lg font-mono text-xs text-foreground break-all">
                  {fingerprint}
                </div>
                <p className="text-xs text-muted-foreground">
                  Compare this with their fingerprint out-of-band
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
                  Display code: <span className="font-mono font-semibold text-accent">{verificationCode}</span>
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
