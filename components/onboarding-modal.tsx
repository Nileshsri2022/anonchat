'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Shield, Lock, AlertTriangle } from 'lucide-react';
import { getOrCreateVault, getStorageKeyManager, resetHistoryStorage } from '@/lib/instances';

interface OnboardingModalProps {
  onComplete: () => void;
}

// Mockup 01: a single welcome card. The optional passphrase seals the
// Identity Vault immediately, using the same flow as Settings (ADR-0004).
export function OnboardingModal({ onComplete }: OnboardingModalProps) {
  const [passphrase, setPassphrase] = useState('');
  const [sealing, setSealing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    setSealing(true);
    setError(null);
    try {
      if (passphrase.trim()) {
        const vault = await getOrCreateVault();
        await vault.seal(passphrase);
        await getStorageKeyManager().then((m) => m.seal(passphrase));
        resetHistoryStorage();
      }
      onComplete();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to seal the vault');
      setSealing(false);
    }
  };

  return (
    <div className="min-h-dvh bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md bg-card border-border shadow-sm">
        <div className="p-6 sm:p-10 text-center">
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 rounded-full bg-primary flex items-center justify-center">
              <Shield className="w-8 h-8 text-primary-foreground" />
            </div>
          </div>

          <h1 className="text-2xl font-semibold text-foreground mb-2">
            Welcome to AnonChat
          </h1>
          <p className="text-muted-foreground mb-8">
            End-to-end encrypted chat. Your keys are generated on this device and never leave it.
          </p>

          <div className="text-left max-w-sm mx-auto space-y-4">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-primary" />
              <span className="text-sm font-semibold text-foreground">
                Your Identity Vault
              </span>
            </div>
            <p className="text-sm text-muted-foreground -mt-2">
              Keys are generated and stay on this device.
            </p>

            <div className="space-y-1.5">
              <Input
                type="password"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                placeholder="Set a Profile Passphrase (optional)"
                autoComplete="new-password"
              />
              <p className="flex items-center gap-1.5 text-xs text-warning">
                <AlertTriangle className="w-3 h-3 shrink-0" />
                Without it, your vault stays unlocked on this device
              </p>
            </div>

            {error && (
              <p className="text-xs text-destructive text-center">{error}</p>
            )}

            <Button onClick={handleCreate} disabled={sealing} className="w-full">
              {sealing ? 'Creating…' : 'Create my identity'}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
