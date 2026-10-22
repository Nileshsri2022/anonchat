// Relay API client with room security metadata and canary support
import type { EncryptedMessage } from './room-encryption';

export interface RelayMessage {
  id: string;
  roomId: string;
  userId: string;
  username: string;
  encryptedContent: string;
  iv: string;
  timestamp: number;
  ip?: string; // Anonymous IP from SOCKS proxy
  expiresAt?: number; // Timestamp when message should auto-delete
}

export interface RoomInfo {
  roomId: string;
  users: Array<{
    id: string;
    username: string;
    joinedAt: number;
  }>;
  messageCount: number;
}

export interface JoinRoomResult {
  userId: string;
  userIP: string;
  userCount?: number;
  isProtected?: boolean;
  canary?: EncryptedMessage;
  name?: string;
}

export interface RoomRecord {
  id: string;
  name?: string;
  userCount?: number;
  createdAt?: string;
  isProtected?: boolean;
}

class RelayAPI {
  private baseUrl: string = '/api/relay';
  private pollingInterval: number = 2000;
  private activeRooms: Map<string, ReturnType<typeof setInterval>> = new Map();

  async createRoom(data: {
    id?: string;
    name?: string;
    isProtected?: boolean;
    canary?: EncryptedMessage;
  }): Promise<{ roomId: string; room: RoomRecord }> {
    const url = `${this.baseUrl}/rooms`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error(`Failed to create room: ${response.statusText}`);
    }

    return response.json();
  }

  async listRooms(): Promise<RoomRecord[]> {
    const url = `${this.baseUrl}/rooms`;
    try {
      const response = await fetch(url);
      if (!response.ok) return [];
      const data = await response.json();
      return data.rooms || [];
    } catch {
      return [];
    }
  }

  async joinRoom(roomId: string, userId: string, username: string): Promise<JoinRoomResult> {
    const url = `${this.baseUrl}/rooms/${roomId}/join`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, username, timestamp: Date.now() }),
    });

    if (!response.ok) {
      throw new Error(`Failed to join room: ${response.statusText}`);
    }

    const data = await response.json();
    return {
      userId: data.userId,
      userIP: data.userIP,
      userCount: data.userCount,
      isProtected: data.isProtected,
      canary: data.canary,
      name: data.name,
    };
  }

  async sendMessage(message: RelayMessage): Promise<{ messageId: string; sentFrom: string }> {
    const url = `${this.baseUrl}/rooms/${message.roomId}/messages`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    });

    if (!response.ok) {
      throw new Error(`Failed to send message: ${response.statusText}`);
    }

    const data = await response.json();
    return { messageId: data.messageId, sentFrom: data.sentFrom };
  }

  async pollMessages(roomId: string, after?: string): Promise<RelayMessage[]> {
    const url = after
      ? `${this.baseUrl}/rooms/${roomId}/messages?after=${encodeURIComponent(after)}`
      : `${this.baseUrl}/rooms/${roomId}/messages`;

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to poll messages: ${response.statusText}`);
    }

    const data = await response.json();
    // The relay returns a bare array of messages.
    return Array.isArray(data) ? data : data.messages || [];
  }

  startPolling(
    roomId: string,
    onNewMessages: (messages: RelayMessage[]) => void,
    lastMessageId?: string
  ): void {
    this.stopPolling(roomId);

    let currentLastId = lastMessageId;

    const poll = async () => {
      try {
        const messages = await this.pollMessages(roomId, currentLastId);

        if (messages.length > 0) {
          onNewMessages(messages);
          currentLastId = messages[messages.length - 1].id;
        }
      } catch (error) {
        console.error('Error polling messages:', error);
      }
    };

    poll();
    const intervalId = setInterval(poll, this.pollingInterval);
    this.activeRooms.set(roomId, intervalId);
  }

  stopPolling(roomId: string): void {
    const intervalId = this.activeRooms.get(roomId);
    if (intervalId) {
      clearInterval(intervalId);
      this.activeRooms.delete(roomId);
    }
  }

  startMessagePolling(roomId: string, callback: (message: RelayMessage) => void): void {
    this.startPolling(roomId, (msgs) => msgs.forEach(callback));
  }

  stopMessagePolling(roomId: string): void {
    this.stopPolling(roomId);
  }

  cleanup(): void {
    this.activeRooms.forEach((_, roomId) => this.stopPolling(roomId));
  }

  async leaveRoom(roomId: string, userId: string): Promise<void> {
    this.stopMessagePolling(roomId);

    const url = `${this.baseUrl}/rooms/${roomId}/leave`;

    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, timestamp: Date.now() }),
      });
    } catch (error) {
      console.error('Error leaving room:', error);
    }
  }

  async getRoomInfo(roomId: string): Promise<RoomInfo> {
    const url = `${this.baseUrl}/rooms/${roomId}/messages`;

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to get room info: ${response.statusText}`);
    }

    const data = await response.json();
    return {
      roomId,
      users: [],
      messageCount: data.messages?.length || 0,
    };
  }
}

export const relayAPI = new RelayAPI();
