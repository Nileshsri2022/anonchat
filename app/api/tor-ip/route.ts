// API route to get current Tor IP
import { NextRequest, NextResponse } from 'next/server';
import { getTorIP } from '@/lib/torProxy';

export async function GET(request: NextRequest) {
    try {
        const ip = await getTorIP();

        return NextResponse.json({
            ip,
            isTor: true,
            timestamp: Date.now()
        });
    } catch (error) {
        console.error('Failed to get Tor IP:', error);
        return NextResponse.json(
            { error: 'Failed to fetch Tor IP' },
            { status: 500 }
        );
    }
}
