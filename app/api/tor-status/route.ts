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

        socket.setTimeout(5000);

        socket.on('connect', () => {
            status.connected = true;
            // Request circuit status
            socket.write('AUTHENTICATE ""\r\n');
        });

        socket.on('data', async (data) => {
            const response = data.toString();

            if (response.includes('250 OK')) {
                // Request bootstrap status
                socket.write('GETINFO status/bootstrap-phase\r\n');
            }

            if (response.includes('BOOTSTRAP')) {
                const progressMatch = response.match(/PROGRESS=(\d+)/);
                if (progressMatch) {
                    status.bootstrapProgress = parseInt(progressMatch[1], 10);
                    status.circuitEstablished = status.bootstrapProgress === 100;
                }

                if (status.circuitEstablished) {
                    // Get exit IP via Tor
                    try {
                        const ipResponse = await fetch('https://api.ipify.org?format=json', {
                            signal: AbortSignal.timeout(10000),
                        });
                        const ipData = await ipResponse.json();
                        status.exitIp = ipData.ip;

                        // Get country
                        const geoResponse = await fetch(`http://ip-api.com/json/${status.exitIp}?fields=countryCode`);
                        const geoData = await geoResponse.json();
                        status.country = geoData.countryCode;
                    } catch {
                        // IP fetch failed, continue without it
                    }
                }

                socket.end();
                resolve(status);
            }
        });

        socket.on('timeout', () => {
            status.error = 'Connection timeout';
            socket.destroy();
            resolve(status);
        });

        socket.on('error', (err) => {
            status.error = err.message;
            resolve(status);
        });

        // Connect to Tor control port
        socket.connect(9051, '127.0.0.1');
    });
}

export async function GET() {
    try {
        const status = await getTorStatus();
        return NextResponse.json(status);
    } catch (error) {
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
