// Relay liveness. Safe to point a platform health check at: it answers 200
// whenever the process can route, and reports Tor separately in the body, so a
// Tor outage degrades the report rather than taking the relay out of service.
import { NextResponse } from 'next/server';
import { readRelayHealth } from '@/lib/relay-health';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
    try {
        const health = await readRelayHealth();
        return NextResponse.json(health, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        return NextResponse.json(
            { status: 'error', error: error instanceof Error ? error.message : 'Unknown error' },
            { status: 503, headers: { 'Cache-Control': 'no-store' } },
        );
    }
}
