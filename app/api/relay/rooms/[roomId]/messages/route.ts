// Relay message endpoint — hardened via RelayCore (ticket 07):
// payload caps (413), per-client rate limits (429), payload-hash replay
// protection with server-assigned sequence numbers (409), expiry sweeps.
import { NextRequest, NextResponse } from 'next/server';
import { relayCore } from '@/lib/instances';

interface IncomingMessage {
  id: string;
  roomId: string;
  userId: string;
  username: string;
  encryptedContent: string;
  iv: string;
  timestamp: number;
  expiresAt?: number;
}

function clientKeyOf(request: NextRequest, body: { userId?: string }): string {
  const forwarded = request.headers.get('x-forwarded-for');
  return forwarded?.split(',')[0].trim() || request.headers.get('x-real-ip') || body.userId || 'unknown';
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ roomId: string }> },
) {
  try {
    const { roomId } = await params;
    const message: IncomingMessage = await request.json();

    const origin = request.headers.get('origin');
    const host = request.headers.get('host') ?? '';
    if (!relayCore.isOriginAllowed(origin, host)) {
      return NextResponse.json({ error: 'Cross-origin requests are not allowed' }, { status: 403 });
    }

    const result = await relayCore.postMessage(
      {
        id: message.id,
        roomId,
        userId: message.userId,
        username: message.username,
        encryptedContent: message.encryptedContent,
        iv: message.iv,
        timestamp: message.timestamp,
        expiresAt: message.expiresAt,
      },
      clientKeyOf(request, message),
    );

    if (!result.accepted) {
      const status = result.reason?.includes('rate') ? 429 : result.reason?.includes('replay') ? 409 : 413;
      return NextResponse.json({ error: result.reason }, { status });
    }

    console.log(RelayLog.received());
    return NextResponse.json({ success: true, messageId: message.id, seq: result.seq });
  } catch {
    return NextResponse.json({ error: 'Failed to store message' }, { status: 500 });
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ roomId: string }> },
) {
  try {
    const { roomId } = await params;
    const { searchParams } = new URL(request.url);
    const after = searchParams.get('after');

    const clientKey = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || request.headers.get('x-real-ip') || 'unknown';
    if (!relayCore.allowRequest(clientKey, 'poll')) {
      return NextResponse.json({ error: 'rate limit exceeded' }, { status: 429 });
    }

    const origin = request.headers.get('origin');
    const host = request.headers.get('host') ?? '';
    if (!relayCore.isOriginAllowed(origin, host)) {
      return NextResponse.json({ error: 'Cross-origin requests are not allowed' }, { status: 403 });
    }

    // `after` carries a message id or a sequence number; resolve to a sequence.
    let afterSeq: number | undefined;
    if (after !== null) {
      const asNumber = Number(after);
      if (Number.isFinite(asNumber) && asNumber > 0) {
        afterSeq = asNumber;
      } else {
        afterSeq = relayCore.seqOf(roomId, after) ?? undefined;
      }
    }

    return NextResponse.json(relayCore.getMessages(roomId, afterSeq));
  } catch {
    return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 });
  }
}

// Identifier-free logging (ticket 07): no room ids, user ids, usernames, or IPs.
const RelayLog = {
  received: () => `[relay] message accepted`,
};
