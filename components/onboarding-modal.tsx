'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Lock, Shield, Eye, Zap } from 'lucide-react';

interface OnboardingModalProps {
  onComplete: () => void;
}

export function OnboardingModal({ onComplete }: OnboardingModalProps) {
  const [step, setStep] = useState(0);

  const steps = [
    {
      title: 'Welcome to AnonChat',
      description: 'Your private, encrypted messaging platform',
      icon: Lock,
      details: [
        'End-to-end encryption using Signal Protocol',
        'Zero message storage',
        'Anonymous Tor routing',
      ],
    },
    {
      title: 'How It Works',
      description: 'Advanced privacy at every step',
      icon: Shield,
      details: [
        'X3DH handshake for key exchange',
        'Double Ratchet for forward secrecy',
        'Sealed-sender technology',
      ],
    },
    {
      title: 'Your Privacy Matters',
      description: 'No metadata. No logs. No tracking.',
      icon: Eye,
      details: [
        'Stateless relay design',
        'Perfect forward secrecy',
        'Protection from future decryption',
      ],
    },
  ];

  const CurrentIcon = steps[step].icon;

  return (
    <div className="min-h-dvh bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md bg-card border-border shadow-sm">
        <div className="p-6 sm:p-10 text-center">
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 rounded-full bg-primary flex items-center justify-center">
              <CurrentIcon className="w-8 h-8 text-primary-foreground" />
            </div>
          </div>

          <h1 className="text-2xl font-semibold text-foreground mb-2">
            {steps[step].title}
          </h1>
          <p className="text-muted-foreground mb-8">
            {steps[step].description}
          </p>

          <div className="space-y-3 mb-10 text-left max-w-sm mx-auto">
            {steps[step].details.map((detail, i) => (
              <div key={i} className="flex items-start gap-3">
                <Zap className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                <span className="text-sm text-muted-foreground">{detail}</span>
              </div>
            ))}
          </div>

          <div className="flex gap-2 justify-center mb-6">
            {steps.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  i === step ? 'bg-primary w-6' : 'bg-border w-1.5'
                }`}
              />
            ))}
          </div>

          <div className="flex gap-3">
            {step > 0 && (
              <Button
                variant="outline"
                onClick={() => setStep(step - 1)}
                className="flex-1"
              >
                Back
              </Button>
            )}
            {step < steps.length - 1 ? (
              <Button onClick={() => setStep(step + 1)} className="flex-1">
                Next
              </Button>
            ) : (
              <Button onClick={onComplete} className="flex-1">
                Start Chatting
              </Button>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
