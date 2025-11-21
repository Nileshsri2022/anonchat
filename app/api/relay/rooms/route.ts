// API route for creating anonymous chat rooms
import { NextRequest, NextResponse } from 'next/server';
import { getTorIP, generateAnonymousId } from '@/lib/torProxy';

export async function POST(request: NextRequest) {
  try {
    // Get anonymous IP through SOCKS proxy
    const anonIP = await getTorIP();

    // Generate anonymous session ID
    const anonId = generateAnonymousId();

    console.log(`🏠 [TOR CIRCUIT] User ${anonId.slice(-6)} created room with rotating IP: ${anonIP}`);

    // Create room with anonymous IP
    const roomData = {
      id: anonId,
      userIP: anonIP,
      createdAt: new Date(),
      participants: [],
    };

    // In production, store in database
    // await db.saveRoom(roomData);

    return NextResponse.json({
      success: true,
      roomId: anonId,
      userIP: anonIP,
      message: 'Room created with anonymous IP',
    });
  } catch (error) {
    console.error('Room creation error:', error);
    return NextResponse.json({
      error: 'Failed to create anonymous room',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
