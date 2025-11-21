// API route for sending and receiving messages (mock relay for development)
import { NextRequest, NextResponse } from 'next/server';
import { getTorIP } from '@/lib/torProxy';

interface StoredMessage {
  id: string;
  roomId: string;
  userId: string;
  username: string;
  encryptedContent: string;
  iv: string;
  timestamp: number;
  ip?: string; // Anonymous IP from SOCKS proxy
}

// In-memory storage for development (replace with Redis/database in production)
const roomMessages = new Map<string, StoredMessage[]>();

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  try {
    const { roomId } = await params;
    const message: StoredMessage = await request.json();


    // Get fresh anonymous IP for each message
    const anonIP = await getTorIP();

    console.log(`💬 [TOR CIRCUIT] User ${message.userId.slice(-6)} sent message in ${roomId.slice(-6)} with circuit IP: ${anonIP}`);

    // Initialize room messages if it doesn't exist
    if (!roomMessages.has(roomId)) {
      roomMessages.set(roomId, []);
    }

    // Store message with anonymous IP
    const messages = roomMessages.get(roomId)!;
    messages.push({
      ...message,
      ip: anonIP
    });

    // Keep only last 100 messages per room
    if (messages.length > 100) {
      messages.shift();
    }

    return NextResponse.json({
      success: true,
      messageId: message.id,
      sentFrom: anonIP
    });
  } catch (error) {
    console.error('[Relay] Error storing message:', error);
    return NextResponse.json({
      error: 'Failed to send message anonymously',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  try {
    const { roomId } = await params;
    const { searchParams } = new URL(request.url);
    const afterId = searchParams.get('after');

    const messages = roomMessages.get(roomId) || [];

    // Filter messages after the specified ID
    let filteredMessages = messages;
    if (afterId) {
      const afterIndex = messages.findIndex(m => m.id === afterId);
      if (afterIndex !== -1) {
        filteredMessages = messages.slice(afterIndex + 1);
      }
    }

    return NextResponse.json(filteredMessages);
  } catch (error) {
    console.error('[Relay] Error fetching messages:', error);
    return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 });
  }
}
