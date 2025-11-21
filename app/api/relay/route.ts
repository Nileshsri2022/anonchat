// Relay Server API Endpoints
import { NextRequest, NextResponse } from 'next/server';

// Store sessions in memory (production would use database)
const sessions = new Map<string, any>();

export async function POST(request: NextRequest) {
  try {
    const { action, sessionId, encryptedPayload, recipientId } = await request.json();

    if (action === 'initiate-session') {
      // Initiate X3DH handshake
      const newSessionId = `sess_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      sessions.set(newSessionId, {
        createdAt: Date.now(),
        messages: [],
        participants: [sessionId],
      });

      return NextResponse.json({
        success: true,
        sessionId: newSessionId,
      });
    }

    if (action === 'relay-message') {
      // Relay encrypted message through Tor
      const session = sessions.get(sessionId);
      if (!session) {
        return NextResponse.json(
          { error: 'Session not found' },
          { status: 404 }
        );
      }

      session.messages.push({
        from: sessionId,
        payload: encryptedPayload,
        timestamp: Date.now(),
      });

      return NextResponse.json({
        success: true,
        delivered: true,
      });
    }

    if (action === 'receive-messages') {
      // Fetch encrypted messages for session
      const session = sessions.get(sessionId);
      if (!session) {
        return NextResponse.json(
          { error: 'Session not found' },
          { status: 404 }
        );
      }

      const messages = session.messages;
      session.messages = [];

      return NextResponse.json({
        messages,
        hasMore: false,
      });
    }

    return NextResponse.json(
      { error: 'Unknown action' },
      { status: 400 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get('sessionId');

  if (!sessionId) {
    return NextResponse.json(
      { error: 'sessionId required' },
      { status: 400 }
    );
  }

  const session = sessions.get(sessionId);
  if (!session) {
    return NextResponse.json(
      { error: 'Session not found' },
      { status: 404 }
    );
  }

  return NextResponse.json({
    sessionId,
    messageCount: session.messages.length,
    createdAt: session.createdAt,
  });
}
