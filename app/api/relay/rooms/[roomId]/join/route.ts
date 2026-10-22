// Relay join endpoint — real membership via RelayCore (ticket 07).
import { NextRequest, NextResponse } from 'next/server';
import { relayCore } from '@/lib/instances';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ roomId: string }> },
) {
  try {
    const { roomId } = await params;
    const body = await request.json();
    const { userId, username, timestamp } = body;

    const origin = request.headers.get('origin');
    const host = request.headers.get('host') ?? '';
    if (!relayCore.isOriginAllowed(origin, host)) {
      return NextResponse.json({ error: 'Cross-origin requests are not allowed' }, { status: 403 });
    }

    const clientKey = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || userId || 'unknown';
    if (!relayCore.allowRequest(clientKey, 'join')) {
      return NextResponse.json({ error: 'rate limit exceeded' }, { status: 429 });
    }

    const metadata = relayCore.getRoom(roomId);
    const userCount = relayCore.join(roomId, { userId, username, joinedAt: timestamp });

    console.log('[relay] join accepted');

    return NextResponse.json({
      success: true,
      userId,
      userCount,
      isProtected: Boolean(metadata?.isProtected),
      canary: metadata?.canary,
      name: metadata?.name,
      message: 'Joined room anonymously',
    });
  } catch {
    return NextResponse.json({ error: 'Failed to join room' }, { status: 500 });
  }
}
