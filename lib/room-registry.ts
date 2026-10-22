import type { EncryptedMessage } from './room-encryption';

export interface RoomMetadata {
  id: string;
  name: string;
  isProtected: boolean;
  canary?: EncryptedMessage;
  createdAt: number;
  userCount: number;
}

export interface CreateRoomInput {
  id?: string;
  name?: string;
  isProtected?: boolean;
  canary?: EncryptedMessage;
}

export class RoomRegistry {
  private rooms = new Map<string, RoomMetadata>();

  createRoom(input: CreateRoomInput): RoomMetadata {
    const id = input.id || `room_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const name = input.name || `Room ${id.slice(-4)}`;
    const isProtected = Boolean(input.isProtected && input.canary);

    const room: RoomMetadata = {
      id,
      name,
      isProtected,
      canary: isProtected ? input.canary : undefined,
      createdAt: Date.now(),
      userCount: 1,
    };

    this.rooms.set(id, room);
    return room;
  }

  getRoom(id: string): RoomMetadata | undefined {
    return this.rooms.get(id);
  }

  listRooms(): RoomMetadata[] {
    return Array.from(this.rooms.values()).sort((a, b) => b.createdAt - a.createdAt);
  }

  updateUserCount(id: string, count: number): void {
    const room = this.rooms.get(id);
    if (room) {
      room.userCount = count;
    }
  }
}

// Global singleton instance for use across API routes
declare global {
  var globalRoomRegistry: RoomRegistry | undefined;
}

export const roomRegistry = globalThis.globalRoomRegistry || (globalThis.globalRoomRegistry = new RoomRegistry());
