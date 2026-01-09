'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RefreshCw, Shield, Globe, Lock } from 'lucide-react';

interface TorCircuitInfo {
    exitIP: string;
    country?: string;
    circuitPath?: string[];
    isConnected: boolean;
}

export function TorCircuitDisplay() {
    const [circuit, setCircuit] = useState<TorCircuitInfo>({
        exitIP: 'Checking...',
        isConnected: false
    });
    const [loading, setLoading] = useState(false);
    const [isElectron, setIsElectron] = useState(false);

    useEffect(() => {
        // Check if running in Electron
        setIsElectron(typeof window !== 'undefined' && !!(window as any).TorAPI);

        // Fetch initial circuit info
        fetchCircuitInfo();

        // Refresh every 30 seconds
        const interval = setInterval(fetchCircuitInfo, 30000);
        return () => clearInterval(interval);
    }, []);

    const fetchCircuitInfo = async () => {
        try {
            if (typeof window !== 'undefined' && (window as any).TorAPI) {
                // Electron: Use TorAPI
                const response = await (window as any).TorAPI.fetch('https://check.torproject.org/api/ip');
                const data = JSON.parse(response);

                setCircuit({
                    exitIP: data.IP || 'Unknown',
                    isConnected: data.IsTor || false
                });
            } else {
                // Browser: Fetch from API (fixed path)
                const response = await fetch('/api/tor-ip');
                const data = await response.json();

                setCircuit({
                    exitIP: data.ip || 'Unknown',
                    isConnected: data.isTor || false
                });
            }
        } catch (error) {
            console.error('Failed to fetch circuit info:', error);
            setCircuit({
                exitIP: 'Error',
                isConnected: false
            });
        }
    };

    const newCircuit = async () => {
        setLoading(true);
        try {
            if (typeof window !== 'undefined' && (window as any).TorAPI) {
                // Electron: Request new circuit
                await (window as any).TorAPI.newTorCircuit();
                // Wait for circuit to establish
                setTimeout(fetchCircuitInfo, 2000);
            } else {
                // Browser: Not supported
                console.warn('Circuit rotation only available in Electron');
            }
        } catch (error) {
            console.error('Failed to create new circuit:', error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Card className="border-primary/20 bg-primary/5">
            <CardContent className="p-3">
                <div className="flex items-center justify-between gap-3">
                    {/* Status Indicator */}
                    <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${circuit.isConnected ? 'bg-green-500 animate-pulse' : 'bg-yellow-500'}`} />
                        <Shield className="w-4 h-4 text-primary" />
                        <span className="text-xs font-medium">Tor Circuit</span>
                    </div>

                    {/* Exit IP Display */}
                    <div className="flex items-center gap-2 px-3 py-1 bg-background/50 rounded-md">
                        <Globe className="w-3 h-3 text-muted-foreground" />
                        <span className="text-xs font-mono">{circuit.exitIP}</span>
                        {circuit.isConnected && (
                            <Lock className="w-3 h-3 text-green-500" />
                        )}
                    </div>

                    {/* New Circuit Button */}
                    {isElectron && (
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={newCircuit}
                            disabled={loading}
                            className="h-7 px-2 text-xs"
                        >
                            <RefreshCw className={`w-3 h-3 mr-1 ${loading ? 'animate-spin' : ''}`} />
                            New Circuit
                        </Button>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
