'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { RefreshCw, Shield, Circle, Lock } from 'lucide-react';

interface CircuitHop {
    nickname: string;
    ip?: string;
    country?: string;
}

interface CircuitInfo {
    circuitId: string;
    hops: {
        guard: CircuitHop | null;
        middle: CircuitHop | null;
        exit: CircuitHop | null;
    };
}

// Country name to flag emoji mapping
const countryFlags: Record<string, string> = {
    'Germany': '🇩🇪',
    'France': '🇫🇷',
    'The Netherlands': '🇳🇱',
    'Netherlands': '🇳🇱',
    'United States': '🇺🇸',
    'United Kingdom': '🇬🇧',
    'Finland': '🇫🇮',
    'Sweden': '🇸🇪',
    'Switzerland': '🇨🇭',
    'Canada': '🇨🇦',
    'Romania': '🇷🇴',
    'Luxembourg': '🇱🇺',
    'Iceland': '🇮🇸',
    'Norway': '🇳🇴',
    'Austria': '🇦🇹',
    'Belgium': '🇧🇪',
    'Denmark': '🇩🇰',
    'Spain': '🇪🇸',
    'Italy': '🇮🇹',
    'Poland': '🇵🇱',
    'Czech Republic': '🇨🇿',
    'Czechia': '🇨🇿',
    'Ireland': '🇮🇪',
    'Portugal': '🇵🇹',
    'Japan': '🇯🇵',
    'Singapore': '🇸🇬',
    'Australia': '🇦🇺',
    'Brazil': '🇧🇷',
    'Russia': '🇷🇺',
    'Ukraine': '🇺🇦',
    'Bulgaria': '🇧🇬',
    'Hungary': '🇭🇺',
    'Moldova': '🇲🇩',
    'Latvia': '🇱🇻',
    'Lithuania': '🇱🇹',
    'Estonia': '🇪🇪',
    'Unknown': '🌐',
};

function getCountryFlag(country?: string): string {
    if (!country) return '🌐';
    return countryFlags[country] || '🌐';
}

export function TorCircuitDisplay() {
    const [circuit, setCircuit] = useState<CircuitInfo | null>(null);
    const [loading, setLoading] = useState(false);
    const [isElectron, setIsElectron] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isOpen, setIsOpen] = useState(false);
    const [exitIP, setExitIP] = useState<string>('...');

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
            setError(null);

            if (typeof window !== 'undefined' && (window as any).TorAPI) {
                // Electron: Get circuit info from Tor control port
                const circuitData = await (window as any).TorAPI.getTorCircuit();

                if (circuitData) {
                    setCircuit(circuitData);
                    // Set exit IP for compact display
                    if (circuitData.hops.exit?.ip) {
                        setExitIP(circuitData.hops.exit.ip);
                    }
                } else {
                    setError('No active circuit');
                }
            } else {
                // Browser: Fetch Tor status from server API
                try {
                    const response = await fetch('/api/tor-status');
                    const data = await response.json();

                    if (data.connected && data.circuitEstablished) {
                        // Use circuit data from API if available
                        if (data.circuit) {
                            setCircuit({
                                circuitId: 'server-tor',
                                hops: {
                                    guard: data.circuit.guard,
                                    middle: data.circuit.middle,
                                    exit: data.circuit.exit
                                }
                            });
                        }
                        setExitIP(data.exitIp || data.circuit?.exit?.ip || 'Connected');
                    } else if (data.connected) {
                        setExitIP(`Bootstrap: ${data.bootstrapProgress}%`);
                    } else {
                        setExitIP(data.error || 'Tor starting...');
                    }
                } catch (err) {
                    setExitIP('Tor unavailable');
                }
            }
        } catch (err) {
            console.error('Failed to fetch circuit info:', err);
            setError('Failed to fetch circuit');
        }
    };

    const newCircuit = async () => {
        setLoading(true);
        try {
            if (typeof window !== 'undefined' && (window as any).TorAPI) {
                const success = await (window as any).TorAPI.newTorCircuit();

                if (success) {
                    // Wait for new circuit to establish
                    setTimeout(fetchCircuitInfo, 3000);
                } else {
                    setError('Failed to create new circuit');
                }
            }
        } catch (err) {
            console.error('Failed to create new circuit:', err);
            setError('Failed to create new circuit');
        } finally {
            setLoading(false);
        }
    };

    // Compact button display
    const CompactButton = () => (
        <button
            onClick={() => setIsOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-primary/10 hover:bg-primary/20 transition-colors text-sm"
        >
            <Shield className="w-4 h-4 text-primary" />
            <span className="font-medium">Tor Circuit</span>
            <Lock className="w-3 h-3 text-green-500" />
            <span className="font-mono text-xs text-muted-foreground">{exitIP}</span>
        </button>
    );

    // Full circuit modal
    const CircuitModal = () => (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Shield className="w-5 h-5 text-primary" />
                        Tor Circuit
                    </DialogTitle>
                </DialogHeader>

                {!isElectron ? (
                    <div className="py-4 text-center text-muted-foreground">
                        <p>Circuit details only available in Electron app</p>
                        <p className="text-sm mt-2">Current IP: {exitIP}</p>
                    </div>
                ) : error || !circuit ? (
                    <div className="py-4 space-y-3">
                        <p className="text-sm text-muted-foreground text-center">
                            {error || 'Loading circuit...'}
                        </p>
                        <Button
                            onClick={fetchCircuitInfo}
                            className="w-full"
                            variant="outline"
                        >
                            <RefreshCw className="w-4 h-4 mr-2" />
                            Retry
                        </Button>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {/* Circuit Path */}
                        <div className="space-y-2">
                            {/* This browser */}
                            <div className="flex items-start gap-2 py-1">
                                <Circle className="w-3 h-3 mt-1 text-muted-foreground fill-muted-foreground" />
                                <span className="text-sm text-muted-foreground">This browser</span>
                            </div>

                            {/* Guard Node */}
                            {circuit.hops.guard && (
                                <div className="flex items-start gap-2 py-1">
                                    <Circle className="w-3 h-3 mt-1 text-muted-foreground fill-muted-foreground" />
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-lg" title={circuit.hops.guard.country}>
                                                {getCountryFlag(circuit.hops.guard.country)}
                                            </span>
                                            <span className="text-xs text-muted-foreground font-mono">
                                                {circuit.hops.guard.ip}
                                            </span>
                                            <span className="text-xs font-semibold text-purple-600 dark:text-purple-400">
                                                Guard
                                            </span>
                                        </div>
                                        <div className="text-xs text-muted-foreground">
                                            {circuit.hops.guard.nickname}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Middle Node */}
                            {circuit.hops.middle && (
                                <div className="flex items-start gap-2 py-1">
                                    <Circle className="w-3 h-3 mt-1 text-muted-foreground fill-muted-foreground" />
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-lg" title={circuit.hops.middle.country}>
                                                {getCountryFlag(circuit.hops.middle.country)}
                                            </span>
                                            <span className="text-xs text-muted-foreground font-mono">
                                                {circuit.hops.middle.ip}
                                            </span>
                                        </div>
                                        <div className="text-xs text-muted-foreground">
                                            {circuit.hops.middle.nickname}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Exit Node */}
                            {circuit.hops.exit && (
                                <div className="flex items-start gap-2 py-1">
                                    <Circle className="w-3 h-3 mt-1 text-muted-foreground fill-muted-foreground" />
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-lg" title={circuit.hops.exit.country}>
                                                {getCountryFlag(circuit.hops.exit.country)}
                                            </span>
                                            <span className="text-xs text-muted-foreground font-mono">
                                                {circuit.hops.exit.ip}
                                            </span>
                                        </div>
                                        <div className="text-xs text-muted-foreground">
                                            {circuit.hops.exit.nickname}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Destination */}
                            <div className="flex items-start gap-2 py-1">
                                <Circle className="w-3 h-3 mt-1 text-muted-foreground fill-muted-foreground" />
                                <span className="text-sm text-muted-foreground">Internet</span>
                            </div>
                        </div>

                        {/* New Circuit Button */}
                        <Button
                            onClick={newCircuit}
                            disabled={loading}
                            className="w-full"
                        >
                            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                            New Circuit for this Site
                        </Button>

                        {/* Info Text */}
                        <p className="text-xs text-muted-foreground text-center">
                            Your <span className="font-semibold text-purple-600 dark:text-purple-400">Guard</span> node may not change.
                        </p>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );

    return (
        <>
            <CompactButton />
            <CircuitModal />
        </>
    );
}
