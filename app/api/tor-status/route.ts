import { NextResponse } from 'next/server';
import { Socket } from 'net';

// Force dynamic - this route must run at request time, not build time
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface CircuitHop {
    nickname: string;
    ip: string;
    country: string;
}

interface TorStatus {
    connected: boolean;
    circuitEstablished: boolean;
    bootstrapProgress: number;
    circuit: {
        guard: CircuitHop | null;
        middle: CircuitHop | null;
        exit: CircuitHop | null;
    } | null;
    exitIp: string | null;
    error?: string;
}

// Query Tor control port for full circuit info
async function getTorStatus(): Promise<TorStatus> {
    return new Promise((resolve) => {
        const socket = new Socket();
        const status: TorStatus = {
            connected: false,
            circuitEstablished: false,
            bootstrapProgress: 0,
            circuit: null,
            exitIp: null,
        };

        let dataBuffer = '';
        let authDone = false;
        let bootstrapDone = false;
        let circuitRequested = false;

        socket.setTimeout(15000);

        socket.on('connect', () => {
            console.log('[TOR-STATUS] Connected to Tor control port');
            status.connected = true;
            socket.write('AUTHENTICATE\r\n');
        });

        socket.on('data', async (data) => {
            dataBuffer += data.toString();
            console.log('[TOR-STATUS] Received:', data.toString().substring(0, 200));

            // Step 1: Auth successful, get bootstrap status
            if (dataBuffer.includes('250 OK') && !authDone) {
                authDone = true;
                socket.write('GETINFO status/bootstrap-phase\r\n');
            }

            // Step 2: Parse bootstrap, if 100% get circuit info
            if (dataBuffer.includes('BOOTSTRAP') && !bootstrapDone) {
                const progressMatch = dataBuffer.match(/PROGRESS=(\d+)/);
                if (progressMatch) {
                    status.bootstrapProgress = parseInt(progressMatch[1], 10);
                    status.circuitEstablished = status.bootstrapProgress === 100;
                    console.log('[TOR-STATUS] Bootstrap:', status.bootstrapProgress);
                }
                bootstrapDone = true;

                if (status.circuitEstablished && !circuitRequested) {
                    circuitRequested = true;
                    // Get circuit info
                    socket.write('GETINFO circuit-status\r\n');
                } else {
                    socket.end();
                    resolve(status);
                }
            }

            // Step 3: Parse circuit info
            if (circuitRequested && dataBuffer.includes('BUILT')) {
                try {
                    // Parse circuit: 1 BUILT $fingerprint~name,$fingerprint~name,$fingerprint~name
                    const circuitMatch = dataBuffer.match(/\d+ BUILT ([^\r\n]+)/);
                    if (circuitMatch) {
                        const hops = circuitMatch[1].split(',');
                        console.log('[TOR-STATUS] Circuit hops:', hops);

                        // Extract node names
                        const extractNode = (hop: string): CircuitHop => {
                            const nameMatch = hop.match(/~(\w+)/);
                            const fingerprintMatch = hop.match(/\$([A-F0-9]+)/);
                            return {
                                nickname: nameMatch ? nameMatch[1] : 'Unknown',
                                ip: fingerprintMatch ? fingerprintMatch[1].substring(0, 8) : 'Unknown',
                                country: 'Unknown'
                            };
                        };

                        if (hops.length >= 3) {
                            status.circuit = {
                                guard: extractNode(hops[0]),
                                middle: extractNode(hops[1]),
                                exit: extractNode(hops[2])
                            };
                        }
                    }
                } catch (e) {
                    console.error('[TOR-STATUS] Error parsing circuit:', e);
                }

                // Get exit IP
                try {
                    const ipResponse = await fetch('https://api.ipify.org?format=json', {
                        signal: AbortSignal.timeout(5000),
                    });
                    const ipData = await ipResponse.json();
                    status.exitIp = ipData.ip;
                    console.log('[TOR-STATUS] Server IP:', status.exitIp);
                } catch {
                    console.log('[TOR-STATUS] Could not get exit IP');
                }

                socket.end();
                resolve(status);
            }
        });

        socket.on('timeout', () => {
            console.log('[TOR-STATUS] Timeout');
            status.error = 'Connection timeout - Tor may still be starting';
            socket.destroy();
            resolve(status);
        });

        socket.on('error', (err) => {
            console.log('[TOR-STATUS] Error:', err.message);
            status.error = err.message;
            resolve(status);
        });

        socket.on('close', () => {
            if (!status.connected && !status.error) {
                status.error = 'Connection closed';
                resolve(status);
            }
        });

        console.log('[TOR-STATUS] Connecting to 127.0.0.1:9051...');
        socket.connect(9051, '127.0.0.1');
    });
}

export async function GET() {
    try {
        const status = await getTorStatus();
        return NextResponse.json(status);
    } catch (error) {
        console.error('[TOR-STATUS] Error:', error);
        return NextResponse.json({
            connected: false,
            circuitEstablished: false,
            bootstrapProgress: 0,
            circuit: null,
            exitIp: null,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
}
