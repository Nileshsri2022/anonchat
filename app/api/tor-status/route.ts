// Reports what the relay's Tor daemon is actually doing.
//
// Every Tor claim in the UI is derived from this endpoint, so it fails closed:
// no reachable control port means no circuit, and no circuit means traffic is not
// routed — whatever the marketing copy would prefer.
import { NextResponse } from 'next/server';
import { readTorStatus } from '@/lib/tor-control';

// Force dynamic - this route must run at request time, not build time.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
    try {
        const status = await readTorStatus();
        // The exit IP is deliberately never fetched here: asking a third-party
        // echo service about our own circuit tells that service who asked.
        return NextResponse.json(
            { ...status, exitIp: null },
            { headers: { 'Cache-Control': 'no-store' } },
        );
    } catch (error) {
        return NextResponse.json(
            {
                connected: false,
                authenticated: false,
                bootstrapProgress: 0,
                circuitEstablished: false,
                circuit: null,
                exitIp: null,
                error: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 200, headers: { 'Cache-Control': 'no-store' } },
        );
    }
}
