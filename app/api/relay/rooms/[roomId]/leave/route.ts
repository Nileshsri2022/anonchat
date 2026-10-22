// Relay leave endpoint — actually removes membership via RelayCore (ticket 07).
import { NextRequest, NextResponse } from 'next/server';
import { relayCore } from '@/lib/relay-core-instance';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ roomId: string }> },
) {
  try {
    const { roomId } = await params;
    const body = await request.json();
    const { userId } = body;

    const origin = request.headers.get('origin');
    const host = request.headers.get('host') ?? '';
    if (!relayCore.isOriginAllowed(origin, host)) {
      return NextResponse.json({ error: 'Cross-origin requests are not allowed' }, { status: 403 });
    }

    const removed = relayCore.leave(roomId, userId);
    return NextResponse.json({ success: true, removed });
  } catch {
    return NextResponse.json({ error: 'Failed to leave room' }, { status: 500 });
  }
}
