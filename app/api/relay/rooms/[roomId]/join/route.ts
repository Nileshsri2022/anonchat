// API route for joining chatrooms (mock relay for development)
import { NextRequest, NextResponse } from 'next/server';
import { getTorIP, generateAnonymousId } from '@/lib/tor-integration';

// In-memory storage for development (replace with Redis in production)
const roomUsers = new Map<string, Set<any>>();

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  try {
    const { roomId } = await params;
    const body = await request.json();
    const { userId, username, timestamp } = body;


    // Get anonymous IP through SOCKS proxy
    const anonIP = await getTorIP();

    // Generate anonymous ID if not provided
    const anonId = userId || generateAnonymousId();

    console.log(`🚪 [TOR CIRCUIT] User ${anonId.slice(-6)} joined room ${roomId.slice(-6)} with new circuit IP: ${anonIP}`);

    // Initialize room if it doesn't exist
    if (!roomUsers.has(roomId)) {
      roomUsers.set(roomId, new Set());
    }

    // Add user to room with anonymous data
    const room = roomUsers.get(roomId)!;
    room.add({
      userId: anonId,
      username: username || `User ${anonId.slice(-4)}`,
      ip: anonIP,
      joinedAt: timestamp
    });

    return NextResponse.json({
      success: true,
      userId: anonId,
      userIP: anonIP,
      userCount: room.size,
      message: 'Joined room anonymously'
    });
  } catch (error) {
    console.error('[Relay] Error joining room:', error);
    return NextResponse.json({
      error: 'Failed to join room anonymously',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
