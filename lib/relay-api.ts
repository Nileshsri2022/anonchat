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

class RelayAPI {
  private baseUrl: string = '/api/relay';
  private pollingInterval: number = 2000;
  private activeRooms: Map<string, ReturnType<typeof setInterval>> = new Map();

  async createRoom(data: {
    id?: string;
    name?: string;
    isProtected?: boolean;
    canary?: EncryptedMessage;
  }): Promise<{ roomId: string; room: any }> {
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

  async listRooms(): Promise<any[]> {
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

  async pollMessages(roomId: string, since?: string): Promise<RelayMessage[]> {
    const url = since
      ? `${this.baseUrl}/rooms/${roomId}/messages?since=${since}`
      : `${this.baseUrl}/rooms/${roomId}/messages`;

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to poll messages: ${response.statusText}`);
    }

    const data = await response.json();
    return data.messages || [];
  }

  startMessagePolling(roomId: string, callback: (message: RelayMessage) => void): void {
    if (this.activeRooms.has(roomId)) {
      return;
    }

    let lastMessageId: string | undefined;

    const interval = setInterval(async () => {
      try {
        const messages = await this.pollMessages(roomId, lastMessageId);

        if (messages.length > 0) {
          lastMessageId = messages[messages.length - 1].id;
          messages.forEach(callback);
        }
      } catch (error) {
        console.error('Error polling messages:', error);
      }
    }, this.pollingInterval);

    this.activeRooms.set(roomId, interval);
  }

  stopMessagePolling(roomId: string): void {
    const interval = this.activeRooms.get(roomId);
    if (interval) {
      clearInterval(interval);
      this.activeRooms.delete(roomId);
    }
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
