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
  expiresAt?: number; // Timestamp when message should auto-delete (disappearing messages)
}

// In-memory replay protection (3-day TTL)
const seenMessages = new Map<string, number>(); // msgId -> expiryTimestamp
const REPLAY_WINDOW_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

// Default disappearing message TTL options (in milliseconds)
export const MESSAGE_TTL_OPTIONS = {
  OFF: 0,
  '30_SECONDS': 30 * 1000,
  '5_MINUTES': 5 * 60 * 1000,
  '1_HOUR': 60 * 60 * 1000,
  '24_HOURS': 24 * 60 * 60 * 1000,
};

// Cleanup expired messages periodically
setInterval(() => {
  const now = Date.now();

  // Cleanup replay protection
  for (const [msgId, expiry] of seenMessages.entries()) {
    if (expiry < now) {
      seenMessages.delete(msgId);
    }
  }

  // Cleanup expired disappearing messages
  for (const [roomId, messages] of roomMessages.entries()) {
    const activeMessages = messages.filter(msg => {
      if (msg.expiresAt && msg.expiresAt < now) {
        console.log(`🗑️ Auto-deleted expired message ${msg.id.slice(0, 8)}`);
        return false;
      }
      return true;
    });
    roomMessages.set(roomId, activeMessages);
  }
}, 10 * 1000); // Check every 10 seconds for disappearing messages

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

    // Log disappearing message info
    if (message.expiresAt) {
      const ttlSeconds = Math.round((message.expiresAt - now) / 1000);
      console.log(`⏱️ Disappearing message: will auto-delete in ${ttlSeconds}s (at ${new Date(message.expiresAt).toLocaleTimeString()})`);
    }

    // Get fresh anonymous IP for each message
    const anonIP = await getTorIP();

    console.log(`💬 [TOR CIRCUIT] User ${message.userId.slice(-6)} sent message in ${roomId.slice(-6)} with circuit IP: ${anonIP}`);

    // Initialize room messages if it doesn't exist
    if (!roomMessages.has(roomId)) {
      roomMessages.set(roomId, []);
    }

    // Store message with anonymous IP (preserve expiresAt!)
    const messages = roomMessages.get(roomId)!;
    messages.push({
      ...message,
      ip: anonIP,
      expiresAt: message.expiresAt, // Explicitly preserve expiresAt
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
    const now = Date.now();

    // Filter out expired messages and messages after the specified ID
    let filteredMessages = messages.filter(msg => !msg.expiresAt || msg.expiresAt > now);

    if (afterId) {
      const afterIndex = filteredMessages.findIndex(m => m.id === afterId);
      if (afterIndex !== -1) {
        filteredMessages = filteredMessages.slice(afterIndex + 1);
      }
    }

    return NextResponse.json(filteredMessages);
  } catch (error) {
    console.error('[Relay] Error fetching messages:', error);
    return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 });
  }
}
