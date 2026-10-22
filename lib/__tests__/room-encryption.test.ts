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

describe('RoomEncryption - Ticket 01: PBKDF2 & Room Canary', () => {
  test('derives keys from room passphrase using PBKDF2 and exchanges encrypted messages', async () => {
    const alice = new RoomEncryption();
    const bob = new RoomEncryption();

    await alice.deriveKeyFromPassphrase('room-top-secret', 'correct-horse-battery');
    await bob.deriveKeyFromPassphrase('room-top-secret', 'correct-horse-battery');

    const message = 'Confidential Tor group broadcast';
    const encrypted = await alice.encrypt(message);
    const decrypted = await bob.decrypt(encrypted);

    expect(decrypted).toBe(message);
  });

  test('generates and verifies Room Canary zero-knowledge', async () => {
    const creator = new RoomEncryption();
    await creator.deriveKeyFromPassphrase('room-omega', 'super-secret-passphrase');
    const canary = await creator.createCanary();

    expect(canary).toBeDefined();
    expect(canary.ciphertext).toBeDefined();
    expect(canary.iv).toBeDefined();

    // Valid joiner with correct passphrase
    const joinerValid = new RoomEncryption();
    await joinerValid.deriveKeyFromPassphrase('room-omega', 'super-secret-passphrase');
    const isValid = await joinerValid.verifyCanary(canary);
    expect(isValid).toBe(true);

    // Invalid joiner with wrong passphrase
    const joinerInvalid = new RoomEncryption();
    await joinerInvalid.deriveKeyFromPassphrase('room-omega', 'wrong-passphrase');
    const isInvalid = await joinerInvalid.verifyCanary(canary);
    expect(isInvalid).toBe(false);
  });

  test('falls back to public room key when passphrase is empty or undefined', async () => {
    const userA = new RoomEncryption();
    const userB = new RoomEncryption();

    await userA.deriveKeyFromPassphrase('public-room-101');
    await userB.deriveRoomKey('public-room-101', 'shared-secret');

    const message = 'Public broadcast';
    const encrypted = await userA.encrypt(message);
    const decrypted = await userB.decrypt(encrypted);

    expect(decrypted).toBe(message);
  });
});
