'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';


interface TorStatus {
  IsTor: boolean;
  IP: string;
}

export function TorStatus() {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<TorStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const testTorConnection = async () => {
    setIsLoading(true);
    setResult(null);
    setError(null);

    try {
      const response = await (window as any).TorAPI.fetch('https://check.torproject.org/api/ip');
      const data: TorStatus = JSON.parse(response as unknown as string);
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to check Tor status');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-foreground">Tor Connection Test</h4>
        <Button
          onClick={testTorConnection}
          disabled={isLoading}
          size="sm"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Testing...
            </>
          ) : (
            'Test Tor'
          )}
        </Button>
      </div>

      {result && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            {result.IsTor ? (
              <CheckCircle className="w-4 h-4 text-green-500" />
            ) : (
              <XCircle className="w-4 h-4 text-red-500" />
            )}
            <span className="text-sm">
              {result.IsTor ? 'Connected through Tor' : 'Not connected through Tor'}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            Exit IP: {result.IP}
          </p>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2">
          <XCircle className="w-4 h-4 text-red-500" />
          <span className="text-sm text-red-500">{error}</span>
        </div>
      )}
    </Card>
  );
}
