'use client';

import { useState, useEffect } from 'react';
import { Shield, ShieldAlert, ShieldCheck, Loader2 } from 'lucide-react';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip';

type TorStatus = 'connected' | 'connecting' | 'disconnected';

export function TorStatusIndicator() {
    const [status, setStatus] = useState<TorStatus>('connecting');
    const [exitIP, setExitIP] = useState<string>('...');
    const [isElectron, setIsElectron] = useState(false);

    useEffect(() => {
        const checkElectron = typeof window !== 'undefined' && !!(window as any).TorAPI;
        setIsElectron(checkElectron);

        if (checkElectron) {
            checkTorStatus();
            const interval = setInterval(checkTorStatus, 30000);
            return () => clearInterval(interval);
        } else {
            // In browser, assume connected if we can fetch
            setStatus('connected');
            fetchBrowserIP();
        }
    }, []);

    const checkTorStatus = async () => {
        try {
            const circuit = await (window as any).TorAPI.getTorCircuit();
            if (circuit && circuit.hops.exit) {
                setStatus('connected');
                setExitIP(circuit.hops.exit.ip || 'Unknown');
            } else {
                setStatus('connecting');
            }
        } catch {
            setStatus('disconnected');
        }
    };

    const fetchBrowserIP = async () => {
        try {
            const response = await fetch('/api/tor-status');
            const data = await response.json();

            if (data.connected && data.circuitEstablished) {
                setStatus('connected');
                setExitIP(data.exitIp || 'Server Tor');
            } else if (data.connected) {
                setStatus('connecting');
                setExitIP(`${data.bootstrapProgress}%`);
            } else {
                setStatus('disconnected');
                setExitIP('Unavailable');
            }
        } catch {
            setStatus('disconnected');
            setExitIP('Error');
        }
    };

    const getStatusColor = () => {
        switch (status) {
            case 'connected': return 'text-green-500';
            case 'connecting': return 'text-yellow-500';
            case 'disconnected': return 'text-red-500';
        }
    };

    const getStatusText = () => {
        switch (status) {
            case 'connected': return `Tor Connected • Exit: ${exitIP}`;
            case 'connecting': return 'Connecting to Tor...';
            case 'disconnected': return 'Tor Disconnected';
        }
    };

    const StatusIcon = () => {
        switch (status) {
            case 'connected':
                return <ShieldCheck className={`w-5 h-5 ${getStatusColor()}`} />;
            case 'connecting':
                return <Loader2 className={`w-5 h-5 ${getStatusColor()} animate-spin`} />;
            case 'disconnected':
                return <ShieldAlert className={`w-5 h-5 ${getStatusColor()}`} />;
        }
    };

    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    <button
                        className="flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-muted transition-colors"
                        onClick={checkTorStatus}
                    >
                        <StatusIcon />
                        {isElectron && (
                            <span className={`text-xs font-medium ${getStatusColor()}`}>
                                {status === 'connected' ? 'Tor' : status}
                            </span>
                        )}
                    </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                    <p className="text-xs">{getStatusText()}</p>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
}
