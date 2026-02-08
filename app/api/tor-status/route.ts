import { NextResponse } from 'next/server';
import { Socket } from 'net';

interface TorStatus {
    connected: boolean;
    circuitEstablished: boolean;
    exitIp: string | null;
    country: string | null;
    bootstrapProgress: number;
    error?: string;
}

// Query Tor control port for status
async function getTorStatus(): Promise<TorStatus> {
    return new Promise((resolve) => {
        const socket = new Socket();
        const status: TorStatus = {
            connected: false,
            circuitEstablished: false,
            exitIp: null,
            country: null,
            bootstrapProgress: 0,
        };

        let dataBuffer = '';

        socket.setTimeout(10000);

        socket.on('connect', () => {
            console.log('[TOR-STATUS] Connected to Tor control port');
            status.connected = true;
            // Authenticate (no password set in torrc)
            socket.write('AUTHENTICATE\r\n');
        });

        socket.on('data', (data) => {
            dataBuffer += data.toString();
            console.log('[TOR-STATUS] Received:', data.toString().trim());

            // After auth, get bootstrap status
            if (dataBuffer.includes('250 OK') && !dataBuffer.includes('BOOTSTRAP')) {
                socket.write('GETINFO status/bootstrap-phase\r\n');
            }

            // Parse bootstrap progress
            if (dataBuffer.includes('BOOTSTRAP')) {
                const progressMatch = dataBuffer.match(/PROGRESS=(\d+)/);
                if (progressMatch) {
                    status.bootstrapProgress = parseInt(progressMatch[1], 10);
                    status.circuitEstablished = status.bootstrapProgress === 100;
                    console.log('[TOR-STATUS] Bootstrap progress:', status.bootstrapProgress);
                }

                // Close socket and resolve
                socket.end();
                resolve(status);
            }
        });

        socket.on('timeout', () => {
            console.log('[TOR-STATUS] Connection timeout');
            status.error = 'Connection timeout - Tor may still be starting';
            socket.destroy();
            resolve(status);
        });

        socket.on('error', (err) => {
            console.log('[TOR-STATUS] Socket error:', err.message);
            status.error = `Tor control port error: ${err.message}`;
            resolve(status);
        });

        socket.on('close', () => {
            if (!status.connected && !status.error) {
                status.error = 'Connection closed unexpectedly';
                resolve(status);
            }
        });

        // Connect to Tor control port
        console.log('[TOR-STATUS] Connecting to Tor control port 9051...');
        socket.connect(9051, '127.0.0.1');
    });
}

// Get the server's exit IP (to show users what IP the server uses)
async function getServerIP(): Promise<string | null> {
    try {
        const response = await fetch('https://api.ipify.org?format=json', {
            signal: AbortSignal.timeout(5000),
        });
        const data = await response.json();
        return data.ip;
    } catch {
        return null;
    }
}

export async function GET() {
    try {
        const status = await getTorStatus();

        // If Tor is connected and circuit established, get the server's IP
        // Note: This gets server IP, not Tor exit IP (would need SOCKS proxy for that)
        if (status.circuitEstablished) {
            status.exitIp = await getServerIP();
        }

        return NextResponse.json(status);
    } catch (error) {
        console.error('[TOR-STATUS] Error:', error);
        return NextResponse.json({
            connected: false,
            circuitEstablished: false,
            exitIp: null,
            country: null,
            bootstrapProgress: 0,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
}
