'use client';

import { useState, useEffect } from 'react';
import { Shield, RefreshCw, Globe, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';

export function TorSettings() {
  const [isElectron, setIsElectron] = useState(false);
  const [torEnabled, setTorEnabled] = useState(true);
  const [status, setStatus] = useState<'connected' | 'connecting' | 'disconnected'>('connecting');
  const [progress, setProgress] = useState(0);
  const [statusSummary, setStatusSummary] = useState('Checking Tor network...');
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    const api = typeof window !== 'undefined' ? window.TorAPI : undefined;
    const hasElectron = !!api;
    setIsElectron(hasElectron);

    if (hasElectron && api) {
      // Check initial proxy status
      api.getTorProxyStatus?.().then((active) => {
        if (typeof active === 'boolean') setTorEnabled(active);
      });

      // Poll bootstrap and circuit status
      const checkStatus = async () => {
        try {
          const bootstrap = await api.getTorBootstrap?.();
          if (bootstrap) {
            setProgress(bootstrap.progress || 0);
            if (bootstrap.progress >= 100) {
              setStatus('connected');
              setStatusSummary('All messages routed through 3-hop Tor circuit');
            } else {
              setStatus('connecting');
              setStatusSummary(`Connecting to Tor: ${bootstrap.progress}% (${bootstrap.summary})`);
            }
          }
        } catch {
          setStatus('disconnected');
          setStatusSummary('Tor daemon offline');
        }
      };

      checkStatus();
      const interval = setInterval(checkStatus, 4000);
      return () => clearInterval(interval);
    } else {
      // Browser mode: check /api/tor-status
      fetch('/api/tor-status')
        .then((r) => r.json())
        .then((data) => {
          if (data.clientIsTor) {
            setStatus('connected');
            setProgress(100);
            setStatusSummary('Tor Browser verified: All traffic routed via Tor exit node');
          } else {
            setStatus('disconnected');
            setStatusSummary('Web Mode: Open in Tor Browser for full circuit routing');
          }
        })
        .catch(() => {
          setStatus('disconnected');
          setStatusSummary('Web Mode: Direct connection');
        });
    }
  }, []);

  const handleToggleTor = async (checked: boolean) => {
    setTorEnabled(checked);
    if (isElectron && window.TorAPI?.setTorProxy) {
      await window.TorAPI.setTorProxy(checked);
      if (!checked) {
        setStatusSummary('Direct connection: Tor proxy bypassed');
      } else {
        setStatusSummary('All application messages routed through Tor');
      }
    }
  };

  const handleNewCircuit = async () => {
    setIsRefreshing(true);
    try {
      if (isElectron && window.TorAPI?.newTorCircuit) {
        await window.TorAPI.newTorCircuit();
        setStatusSummary('Requested fresh Tor circuit and new identity...');
      }
    } finally {
      setTimeout(() => setIsRefreshing(false), 2500);
    }
  };

  return (
    <div className="space-y-4 pt-4 border-t border-border">
      <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
        <Globe className="w-4 h-4 text-primary" />
        Tor Network & Traffic Routing
      </h3>

      <div className="space-y-3">
        {/* Toggle Tor Routing */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5 pr-2">
            <p className="text-sm font-medium text-foreground">Route All Messages via Tor</p>
            <p className="text-xs text-muted-foreground">
              {isElectron
                ? 'Forces all HTTP and WebSocket message traffic through 127.0.0.1:9050'
                : 'Protects your real IP using multi-hop Tor circuits'}
            </p>
          </div>
          <Switch
            checked={torEnabled}
            onCheckedChange={handleToggleTor}
            disabled={!isElectron}
          />
        </div>

        {/* Live Status Card */}
        <div className="p-3 rounded-lg border border-border bg-card/60 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              {status === 'connected' ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-success" />
              ) : status === 'connecting' ? (
                <Loader2 className="w-3.5 h-3.5 text-warning animate-spin" />
              ) : (
                <AlertCircle className="w-3.5 h-3.5 text-muted-foreground" />
              )}
              Network Status
            </span>
            <span
              className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                status === 'connected'
                  ? 'bg-success/10 text-success'
                  : status === 'connecting'
                  ? 'bg-warning/10 text-warning'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              {status === 'connected'
                ? 'Tor Active'
                : status === 'connecting'
                ? `Connecting ${progress}%`
                : 'Direct Mode'}
            </span>
          </div>

          <p className="text-xs text-foreground/90">{statusSummary}</p>

          {isElectron && torEnabled && (
            <div className="pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleNewCircuit}
                disabled={isRefreshing}
                className="w-full text-xs h-8"
              >
                <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                {isRefreshing ? 'Switching Circuit...' : 'Request New Tor Identity'}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
