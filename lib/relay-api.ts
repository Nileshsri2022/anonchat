// Simplified relay API client without URL constructor - v2.0
// Handles communication with the AnonChat relay server via Tor
// Cache bust: 2024-01-19

export interface RelayMessage {
  id: string;
  roomId: string;
  userId: string;
  username: string;
  encryptedContent: string;
  iv: string;
  timestamp: number;
  ip?: string; // Anonymous IP from SOCKS proxy
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

class RelayAPI {
  private baseUrl: string = '/api/relay';
  private pollingInterval: number = 2000;
  private activeRooms: Map<string, ReturnType<typeof setInterval>> = new Map();

  async joinRoom(roomId: string, userId: string, username: string): Promise<{ userId: string; userIP: string }> {
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
    return { userId: data.userId, userIP: data.userIP };
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

  async pollMessages(roomId: string, lastMessageId?: string): Promise<RelayMessage[]> {
    try {
      let url = `${this.baseUrl}/rooms/${roomId}/messages`;
      
      if (lastMessageId) {
        url = `${url}?after=${encodeURIComponent(lastMessageId)}`;
      }

      const response = await fetch(url);
      
      if (!response.ok) {
        return [];
      }

      return await response.json();
    } catch (error) {
      // Silently handle polling errors to avoid console spam
      return [];
    }
  }

  startPolling(
    roomId: string,
    onNewMessages: (messages: RelayMessage[]) => void,
    lastMessageId?: string
  ): void {
    this.stopPolling(roomId);

    let currentLastId = lastMessageId;

    const poll = async () => {
      const messages = await this.pollMessages(roomId, currentLastId);
      
      if (messages.length > 0) {
        onNewMessages(messages);
        currentLastId = messages[messages.length - 1].id;
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

  async leaveRoom(roomId: string, userId: string): Promise<void> {
    this.stopPolling(roomId);

    try {
      const url = `${this.baseUrl}/rooms/${roomId}/leave`;
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, timestamp: Date.now() }),
      });
    } catch (error) {
      // Silently handle leave room errors
    }
  }

  async getRoomInfo(roomId: string): Promise<RoomInfo | null> {
    try {
      const url = `${this.baseUrl}/rooms/${roomId}`;
      const response = await fetch(url);
      
      if (!response.ok) {
        return null;
      }

      return await response.json();
    } catch (error) {
      return null;
    }
  }

  cleanup(): void {
    this.activeRooms.forEach((_, roomId) => this.stopPolling(roomId));
  }
}

export const relayAPI = new RelayAPI();
