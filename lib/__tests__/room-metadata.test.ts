import { describe, test, expect } from 'bun:test';
import { RoomRegistry, type RoomMetadata } from '../room-registry';
import { RoomEncryption } from '../room-encryption';

describe('RoomRegistry - Ticket 02: Room Metadata & Canary Distribution', () => {
  test('creates protected room with canary and retrieves metadata on join', async () => {
    const registry = new RoomRegistry();
    const enc = new RoomEncryption();

    const roomId = 'room_protected_123';
    await enc.deriveKeyFromPassphrase(roomId, 'my-super-secret');
    const canary = await enc.createCanary();

    const created = registry.createRoom({
      id: roomId,
      name: 'Alpha Bunker',
      isProtected: true,
      canary,
    });

    expect(created.id).toBe(roomId);
    expect(created.name).toBe('Alpha Bunker');
    expect(created.isProtected).toBe(true);
    expect(created.canary).toEqual(canary);

    // Joining client retrieves room metadata to perform zero-knowledge verification
    const fetched = registry.getRoom(roomId);
    expect(fetched).toBeDefined();
    expect(fetched?.isProtected).toBe(true);
    expect(fetched?.canary).toEqual(canary);
  });

  test('creates public room without passphrase and returns isProtected false', () => {
    const registry = new RoomRegistry();
    const roomId = 'room_public_456';

    const created = registry.createRoom({
      id: roomId,
      name: 'Public Lobby',
      isProtected: false,
    });

    expect(created.isProtected).toBe(false);
    expect(created.canary).toBeUndefined();

    const fetched = registry.getRoom(roomId);
    expect(fetched?.isProtected).toBe(false);
    expect(fetched?.canary).toBeUndefined();
  });
});
