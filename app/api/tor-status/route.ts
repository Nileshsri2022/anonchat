// Reports Tor status for both the relay daemon and the visiting client.
// Derives client Tor usage via Tor Project's official TorDNSEL.
import { NextRequest, NextResponse } from 'next/server';
import { readTorStatus } from '@/lib/tor-control';
import dns from 'node:dns/promises';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Check if the caller IP is an active Tor exit node using official TorDNSEL
 */
async function isTorExitNode(ip: string): Promise<boolean> {
  try {
    const cleanIp = ip.trim();
    const parts = cleanIp.split('.');
    if (parts.length !== 4) return false;
    // Don't check loopback / private ranges
    if (cleanIp.startsWith('10.') || cleanIp.startsWith('192.168.') || cleanIp.startsWith('127.')) {
      return false;
    }
    const reversed = [...parts].reverse().join('.');
    const lookup = `${reversed}.dnsel.torproject.org`;
    const addresses = await dns.resolve4(lookup);
    return addresses.includes('127.0.0.2');
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  const forwarded = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip');
  const clientIp = forwarded ? forwarded.split(',')[0].trim() : '127.0.0.1';
  const clientIsTor = await isTorExitNode(clientIp);

  try {
    const status = await readTorStatus();
    return NextResponse.json(
      {
        ...status,
        clientIsTor,
        clientIp: clientIsTor ? clientIp : null,
        connected: status.connected || clientIsTor,
        circuitEstablished: status.circuitEstablished || clientIsTor,
        exitIp: status.circuitEstablished ? null : (clientIsTor ? clientIp : null),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        connected: clientIsTor,
        authenticated: false,
        bootstrapProgress: clientIsTor ? 100 : 0,
        circuitEstablished: clientIsTor,
        clientIsTor,
        clientIp: clientIsTor ? clientIp : null,
        circuit: null,
        exitIp: clientIsTor ? clientIp : null,
        error: clientIsTor ? null : (error instanceof Error ? error.message : 'Unknown error'),
      },
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
