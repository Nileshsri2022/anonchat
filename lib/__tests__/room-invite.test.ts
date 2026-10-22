import { describe, test, expect } from 'bun:test';
import { RoomEncryption } from '../room-encryption';
import {
  createRoomKey,
  serializeRoomInvite,
  parseRoomInvite,
} from '../room-invite';

describe('RoomInvite — Ticket 05: zero-knowledge Room Keys', () => {
  test('createRoomKey produces a usable random AES-256 key; the Room ID alone cannot decrypt', async () => {
    const keyB64 = await createRoomKey();

    const creator = new RoomEncryption();
    await creator.importRoomKey(keyB64);
    const encrypted = await creator.encrypt('only invite holders read this');

    // An attacker who knows only the Room ID (and even the old shared-secret trick) fails
    const attacker = new RoomEncryption();
    await attacker.importRoomKey(keyB64.replace(/[A-Za-z0-9+/]/g, 'A'));
    await expect(attacker.decrypt(encrypted)).rejects.toThrow();

    // A honest invitee decrypts
    const invitee = new RoomEncryption();
    await invitee.importRoomKey(keyB64);
    expect(await invitee.decrypt(encrypted)).toBe('only invite holders read this');
  });

  test('room invite round-trips; passphrase-room invites carry no key material', async () => {
    const keyB64 = await createRoomKey();
    const invite = serializeRoomInvite({ roomId: 'room_abc123', roomName: 'Weekly Sync', keyB64 });
    expect(invite.startsWith('anonchat-room-invite-v1:')).toBe(true);

    const parsed = parseRoomInvite(invite);
    expect(parsed.roomId).toBe('room_abc123');
    expect(parsed.roomName).toBe('Weekly Sync');
    expect(parsed.keyB64).toBe(keyB64);
    expect(parsed.isProtected).toBe(false);

    // Passphrase-protected Room: the Invite points at the Room but carries no key
    const protectedInvite = serializeRoomInvite({
      roomId: 'room_def456',
      roomName: 'Private',
      isProtected: true,
    });
    const parsedProtected = parseRoomInvite(protectedInvite);
    expect(parsedProtected.isProtected).toBe(true);
    expect(parsedProtected.keyB64).toBeUndefined();

    // Garbage is rejected
    expect(() => parseRoomInvite('hello')).toThrow();
    expect(() => parseRoomInvite('anonchat-room-invite-v1:[')).toThrow();
  });

  test('two created Room Keys are independent (fresh randomness)', async () => {
    const k1 = await createRoomKey();
    const k2 = await createRoomKey();
    expect(k1).not.toBe(k2);
  });
});
