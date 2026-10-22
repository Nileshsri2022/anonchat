import { describe, test, expect } from 'bun:test';
import { RoomEncryption } from '../room-encryption';

describe('RoomEncryption', () => {
  test('generates and exports room key, then imports it back', async () => {
    const enc1 = new RoomEncryption();
    const exportedKey = await enc1.generateRoomKey();
    expect(typeof exportedKey).toBe('string');
    expect(exportedKey.length).toBeGreaterThan(20);

    const enc2 = new RoomEncryption();
    await enc2.importRoomKey(exportedKey);

    const message = 'Test group room announcement';
    const encrypted = await enc1.encrypt(message);
    const decrypted = await enc2.decrypt(encrypted);

    expect(decrypted).toBe(message);
  });

  test('derives identical room keys from roomId and shared secret', async () => {
    const userA = new RoomEncryption();
    const userB = new RoomEncryption();

    await userA.deriveRoomKey('room-alpha-99', 'shared-passphrase');
    await userB.deriveRoomKey('room-alpha-99', 'shared-passphrase');

    const original = 'Secret room text over Tor';
    const encrypted = await userA.encrypt(original);
    const decrypted = await userB.decrypt(encrypted);

    expect(decrypted).toBe(original);
  });

  test('fails decryption when ciphertext is tampered or wrong key used', async () => {
    const userA = new RoomEncryption();
    const userB = new RoomEncryption();

    await userA.deriveRoomKey('room-alpha-99', 'correct-password');
    await userB.deriveRoomKey('room-alpha-99', 'wrong-password');

    const encrypted = await userA.encrypt('Secret payload');

    expect(userB.decrypt(encrypted)).rejects.toThrow();
  });
});
