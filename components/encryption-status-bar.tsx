'use client';

import { Lock, Zap, AlertTriangle } from 'lucide-react';

interface EncryptionStatusBarProps {
  status: 'pending' | 'established' | 'verified';
  torConnected: boolean;
  messageCount?: number;
}

export function EncryptionStatusBar({
  status,
  torConnected,
  messageCount = 0,
}: EncryptionStatusBarProps) {
  const statusConfig = {
    pending: {
      icon: AlertTriangle,
      label: 'Establishing encryption',
      color: 'text-warning',
      bgColor: 'bg-warning/10',
    },
    established: {
      icon: Lock,
      label: 'Encrypted',
      color: 'text-accent',
      bgColor: 'bg-accent/10',
    },
    verified: {
      icon: Zap,
      label: 'Verified & encrypted',
      color: 'text-success',
      bgColor: 'bg-success/10',
    },
  };

  const config = statusConfig[status];
  const StatusIcon = config.icon;

  return (
    <div className={`px-3 py-2 rounded-lg ${config.bgColor} flex items-center gap-2`}>
      <StatusIcon className={`w-4 h-4 ${config.color}`} />
      <span className="text-xs font-medium text-foreground">
        {config.label}
      </span>
      {torConnected ? (
        <>
          <span className="text-muted-foreground mx-1">•</span>
          <span className="text-xs text-green-600 dark:text-green-400">via Tor</span>
        </>
      ) : (
        <>
          <span className="text-muted-foreground mx-1">•</span>
          <span className="text-xs text-orange-600 dark:text-orange-400">Tor not connected</span>
        </>
      )}
      {messageCount > 0 && (
        <>
          <span className="text-muted-foreground mx-1">•</span>
          <span className="text-xs text-muted-foreground">
            {messageCount} encrypted
          </span>
        </>
      )}
    </div>
  );
}
