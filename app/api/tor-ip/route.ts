// API route to get the current Tor exit IP.
//
// Must run at request time: prerendered at build time this endpoint froze one
// value for the life of the deploy and served it as if it were live.
import { NextResponse } from 'next/server';
import { getTorIP } from '@/lib/tor-integration';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
    try {
        const ip = await getTorIP();

        // `isTor` reports whether traffic is actually leaving through a circuit.
        // With no circuit there is no exit IP, and saying otherwise would be the
        // one lie an anonymity app must not tell.
        return NextResponse.json(
            { ip, isTor: ip !== null, timestamp: Date.now() },
            { headers: { 'Cache-Control': 'no-store' } },
        );
    } catch (error) {
        console.error('Failed to get Tor IP:', error);
        return NextResponse.json(
            { ip: null, isTor: false, error: 'Failed to fetch Tor IP', timestamp: Date.now() },
            { status: 503, headers: { 'Cache-Control': 'no-store' } },
        );
    }
}
