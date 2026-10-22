// API route for creating and listing anonymous chat rooms
import { NextRequest, NextResponse } from 'next/server';
import { getTorIP, generateAnonymousId } from '@/lib/tor-integration';
import { roomRegistry } from '@/lib/room-registry';

export async function GET() {
  try {
    const rooms = roomRegistry.listRooms();
    return NextResponse.json({ success: true, rooms });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to list rooms' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const anonIP = await getTorIP();
    const body = await request.json().catch(() => ({}));

    const roomId = body.id || generateAnonymousId();
    const room = roomRegistry.createRoom({
      id: roomId,
      name: body.name,
      isProtected: body.isProtected,
      canary: body.canary,
    });

    console.log(`🏠 [TOR CIRCUIT] Room created: ${room.id.slice(-6)} (Protected: ${room.isProtected}) with rotating IP: ${anonIP}`);

    return NextResponse.json({
      success: true,
      roomId: room.id,
      room,
      userIP: anonIP,
      message: 'Room created successfully',
    });
  } catch (error) {
    console.error('Room creation error:', error);
    return NextResponse.json(
      {
        error: 'Failed to create anonymous room',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
