// API route for joining chatrooms
import { NextRequest, NextResponse } from 'next/server';
import { getTorIP, generateAnonymousId } from '@/lib/tor-integration';
import { roomRegistry } from '@/lib/room-registry';

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

    const anonIP = await getTorIP();
    const anonId = userId || generateAnonymousId();

    // Check room security metadata in registry
    const metadata = roomRegistry.getRoom(roomId);

    console.log(`🚪 [TOR CIRCUIT] User ${anonId.slice(-6)} joined room ${roomId.slice(-6)} (Protected: ${metadata?.isProtected || false}) IP: ${anonIP}`);

    if (!roomUsers.has(roomId)) {
      roomUsers.set(roomId, new Set());
    }

    const room = roomUsers.get(roomId)!;
    room.add({
      userId: anonId,
      username: username || `User ${anonId.slice(-4)}`,
      ip: anonIP,
      joinedAt: timestamp,
    });

    // Update count in registry
    roomRegistry.updateUserCount(roomId, room.size);

    return NextResponse.json({
      success: true,
      userId: anonId,
      userIP: anonIP,
      userCount: room.size,
      isProtected: Boolean(metadata?.isProtected),
      canary: metadata?.canary,
      name: metadata?.name,
      message: 'Joined room anonymously',
    });
  } catch (error) {
    console.error('[Relay] Error joining room:', error);
    return NextResponse.json(
      {
        error: 'Failed to join room anonymously',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
