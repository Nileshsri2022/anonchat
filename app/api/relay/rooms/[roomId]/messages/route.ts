// API route for sending and receiving messages with replay protection
import { NextRequest, NextResponse } from 'next/server';
import { getTorIP } from '@/lib/tor-integration';

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

// In-memory replay protection (3-day TTL)
const seenMessages = new Map<string, number>(); // msgId -> expiryTimestamp
const REPLAY_WINDOW_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

// Cleanup expired messages periodically
setInterval(() => {
  const now = Date.now();
  for (const [msgId, expiry] of seenMessages.entries()) {
    if (expiry < now) {
      seenMessages.delete(msgId);
    }
  }
}, 60 * 60 * 1000); // Cleanup every hour

// In-memory storage for development
const roomMessages = new Map<string, StoredMessage[]>();

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  try {
    const { roomId } = await params;
    const message: StoredMessage = await request.json();

    // REPLAY PROTECTION: Check if message already seen
    const msgId = message.id;
    const now = Date.now();

    if (seenMessages.has(msgId)) {
      const expiry = seenMessages.get(msgId)!;
      if (expiry > now) {
        console.warn(`🚫 Replay attack detected: ${msgId}`);
        return NextResponse.json(
          { error: 'Duplicate message (replay detected)' },
          { status: 409 }
        );
      }
    }

    // Mark as seen with 3-day expiry
    seenMessages.set(msgId, now + REPLAY_WINDOW_MS);
    console.log(`✅ Message ${msgId.slice(0, 8)} marked as seen`);


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
