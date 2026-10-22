'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, dialogSheetMobile } from '@/components/ui/dialog';
import { RefreshCw, Shield, Circle } from 'lucide-react';

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

// Country code to flag emoji mapping (2-letter ISO codes)
const countryFlags: Record<string, string> = {
    'DE': '🇩🇪', // Germany
    'FR': '🇫🇷', // France
    'NL': '🇳🇱', // Netherlands
    'US': '🇺🇸', // United States
    'GB': '🇬🇧', // United Kingdom
    'FI': '🇫🇮', // Finland
    'SE': '🇸🇪', // Sweden
    'CH': '🇨🇭', // Switzerland
    'CA': '🇨🇦', // Canada
    'RO': '🇷🇴', // Romania
    'LU': '🇱🇺', // Luxembourg
    'IS': '🇮🇸', // Iceland
    'NO': '🇳🇴', // Norway
    'AT': '🇦🇹', // Austria
    'BE': '🇧🇪', // Belgium
    'DK': '🇩🇰', // Denmark
    'ES': '🇪🇸', // Spain
    'IT': '🇮🇹', // Italy
    'PL': '🇵🇱', // Poland
    'CZ': '🇨🇿', // Czech Republic
    'IE': '🇮🇪', // Ireland
    'PT': '🇵🇹', // Portugal
    'JP': '🇯🇵', // Japan
    'SG': '🇸🇬', // Singapore
    'AU': '🇦🇺', // Australia
    'BR': '🇧🇷', // Brazil
    'RU': '🇷🇺', // Russia
    'UA': '🇺🇦', // Ukraine
    'BG': '🇧🇬', // Bulgaria
    'HU': '🇭🇺', // Hungary
    'MD': '🇲🇩', // Moldova
    'LV': '🇱🇻', // Latvia
    'LT': '🇱🇹', // Lithuania
    'EE': '🇪🇪', // Estonia
    'Unknown': '🌐',
};

function getCountryFlag(country?: string): string {
    if (!country) return '🌐';
    return countryFlags[country] || '🌐';
}

// Never render a raw exit IP on screen (mockup 08): 185.x.y.z -> 185.•.•.•
function maskIP(ip: string): string {
    const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (!m) return ip;
    return m[1] + '.•.•.•';
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
        setIsElectron(typeof window !== 'undefined' && !!window.TorAPI);

        // Fetch initial circuit info
        fetchCircuitInfo();

        // Refresh every 30 seconds
        const interval = setInterval(fetchCircuitInfo, 30000);
        return () => clearInterval(interval);
    }, []);

    const fetchCircuitInfo = async () => {
        try {
            setError(null);

            if (typeof window !== 'undefined' && window.TorAPI) {
                // Electron: Get circuit info from Tor control port
                const circuitData = await window.TorAPI.getTorCircuit();

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
                        setExitIP('Direct Web (Tor inactive)');
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
            if (typeof window !== 'undefined' && window.TorAPI) {
                const success = await window.TorAPI.newTorCircuit();

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

    // Slim circuit strip (mockup 03): dot + DE -> NL -> IS · #id
    const hopsLabel = circuit
        ? [circuit.hops.guard, circuit.hops.middle, circuit.hops.exit]
              .map((h) => (h?.country && h.country !== 'Unknown' ? h.country : null))
              .filter(Boolean)
              .join(' \u2192 ')
        : '';
    const circuitTag =
        circuit?.circuitId && circuit.circuitId !== 'server-tor'
            ? ` \u00b7 #${circuit.circuitId.slice(0, 4)}`
            : '';

    const CompactButton = () => (
        <button
            onClick={() => setIsOpen(true)}
            title="Tor circuit details"
            className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors w-full"
        >
            <span className={`w-2 h-2 rounded-full shrink-0 ${circuit ? 'bg-success' : 'bg-warning'}`} />
            <span className="truncate">
                {hopsLabel ? `Tor circuit: ${hopsLabel}` : `Connection: ${maskIP(exitIP)}`} {circuitTag}
            </span>
            <RefreshCw className="w-3 h-3 ml-auto shrink-0" />
        </button>
    );

    // Full circuit modal
    const CircuitModal = () => (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogContent className={`sm:max-w-md ${dialogSheetMobile}`}>
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Shield className="w-4 h-4 text-success" />
                        Tor circuit
                    </DialogTitle>
                </DialogHeader>

                {error || !circuit ? (
                    <div className="py-4 space-y-3">
                        <p className="text-sm text-muted-foreground text-center">
                            Standard Web Connection
                        </p>
                        <p className="text-xs text-muted-foreground text-center px-2">End-to-end message encryption is active. To route network traffic through Tor circuits, open this URL in Tor Browser or use the Desktop App.</p>
                        <p className="text-xs text-muted-foreground text-center">Status: {maskIP(exitIP)}</p>
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
                                <div className="flex items-start gap-3 p-3 rounded-lg border border-border bg-card">
                                    <Circle className="w-3 h-3 mt-1 text-muted-foreground fill-muted-foreground" />
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-sm font-bold text-foreground">
                                                {getCountryFlag(circuit.hops.guard.country)}{' '}
                                                {circuit.hops.guard.country && circuit.hops.guard.country !== 'Unknown'
                                                    ? circuit.hops.guard.country
                                                    : '??'}
                                            </span>
                                            <span className="text-sm text-muted-foreground font-mono">
                                                {circuit.hops.guard.ip && circuit.hops.guard.ip !== 'Unknown'
                                                    ? circuit.hops.guard.ip
                                                    : ''}
                                            </span>
                                            <span className="text-xs font-semibold text-primary">
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
                                <div className="flex items-start gap-3 p-3 rounded-lg border border-border bg-card">
                                    <Circle className="w-3 h-3 mt-1 text-muted-foreground fill-muted-foreground" />
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-sm font-bold text-foreground">
                                                {getCountryFlag(circuit.hops.middle.country)}{' '}
                                                {circuit.hops.middle.country && circuit.hops.middle.country !== 'Unknown'
                                                    ? circuit.hops.middle.country
                                                    : '??'}
                                            </span>
                                            <span className="text-sm text-muted-foreground font-mono">
                                                {circuit.hops.middle.ip && circuit.hops.middle.ip !== 'Unknown'
                                                    ? circuit.hops.middle.ip
                                                    : ''}
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
                                <div className="flex items-start gap-3 p-3 rounded-lg border border-border bg-card">
                                    <Circle className="w-3 h-3 mt-1 text-muted-foreground fill-muted-foreground" />
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-sm font-bold text-foreground">
                                                {getCountryFlag(circuit.hops.exit.country)}{' '}
                                                {circuit.hops.exit.country && circuit.hops.exit.country !== 'Unknown'
                                                    ? circuit.hops.exit.country
                                                    : '??'}
                                            </span>
                                            <span className="text-sm text-muted-foreground font-mono">
                                                {circuit.hops.exit.ip && circuit.hops.exit.ip !== 'Unknown'
                                                    ? circuit.hops.exit.ip
                                                    : ''}
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

                        {/* Exit IP row (mockup 08) */}
                        <div className="flex items-center justify-between px-3 py-2 rounded-lg border border-border text-sm">
                            <span className="text-muted-foreground">Exit IP</span>
                            <span className="font-mono text-xs">{maskIP(exitIP)}</span>
                        </div>

                        {/* New Circuit Button */}
                        <Button
                            onClick={newCircuit}
                            disabled={loading}
                            className="w-full"
                        >
                            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                            New circuit
                        </Button>

                        {/* Info Text */}
                        <p className="text-xs text-muted-foreground text-center">
                            Your <span className="font-semibold text-primary">Guard</span> node may not change.
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
