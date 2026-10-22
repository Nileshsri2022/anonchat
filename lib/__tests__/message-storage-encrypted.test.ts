import { describe, test, expect } from 'bun:test';
import { MemoryKVStore } from '../kv-store';

/**
 * MessageStorage with an at-rest encryption layer (ADR-0004): when a storage key
 * is set, message bodies hit the store only as AES-GCM ciphertext; loading
 * decrypts transparently. Without a key the store behaves as device-local
 * plaintext (caveat mode). A sealed+locked vault yields no key, so history
 * is inaccessible.
 */
import { StorageKeyManager } from '../storage-key';
import { createEncryptedStorage } from '../message-storage';

describe('MessageStorage — Ticket 06: encrypted local history', () => {
  test('with a storage key set, the raw store contains only ciphertext, never plaintext bodies', async () => {
    const kv = new MemoryKVStore();
    const manager = new StorageKeyManager(kv);
    const key = await manager.getOrCreate();
    const storage = createEncryptedStorage(kv, key);

    await storage.saveMessage({
      id: 'm1',
      roomId: 'room_x',
      userId: 'u1',
      username: 'alice',
      content: 'PLAINTEXT-MUST-NOT-APPEAR',
      timestamp: Date.now(),
      encrypted: true,
    });

    const raw = JSON.stringify(await kv.get('messages:m1'));
    expect(raw).not.toContain('PLAINTEXT-MUST-NOT-APPEAR');
    expect(raw).not.toContain('alice');
    expect(raw).toContain('blob');
  });

  test('history decrypts transparently on reload with the same key', async () => {
    const kv = new MemoryKVStore();
    const manager = new StorageKeyManager(kv);
    const key = await manager.getOrCreate();
    const writer = createEncryptedStorage(kv, key);
    await writer.saveMessage({
      id: 'm2',
      roomId: 'room_x',
      userId: 'u1',
      username: 'alice',
      content: 'decryptable history',
      timestamp: 12345,
      encrypted: true,
    });

    // "Reload": fresh storage instance, same persisted key
    const reader = createEncryptedStorage(kv, key);
    const loaded = await reader.getMessagesByRoom('room_x');
    expect(loaded.length).toBe(1);
    expect(loaded[0].content).toBe('decryptable history');
    expect(loaded[0].username).toBe('alice');
  });

  test('a wrong key cannot read history; without any key (caveat mode) storage is plaintext', async () => {
    const kv = new MemoryKVStore();
    const manager = new StorageKeyManager(kv);
    const key = await manager.getOrCreate();
    const writer = createEncryptedStorage(kv, key);
    await writer.saveMessage({
      id: 'm3',
      roomId: 'room_y',
      userId: 'u1',
      username: 'bob',
      content: 'secret words',
      timestamp: 1,
      encrypted: true,
    });

    const otherKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
    const intruder = createEncryptedStorage(kv, otherKey);
    const loaded = await intruder.getMessagesByRoom('room_y');
    expect(loaded.length).toBe(0); // undecryptable entries are not surfaced

    // Caveat mode: no key → plaintext body in the store
    const kv2 = new MemoryKVStore();
    const plain = createEncryptedStorage(kv2, null);
    await plain.saveMessage({
      id: 'm4',
      roomId: 'room_z',
      userId: 'u1',
      username: 'carol',
      content: 'plaintext-accepted-with-caveat',
      timestamp: 2,
      encrypted: true,
    });
    const raw2 = JSON.stringify(await kv2.get('messages:m4'));
    expect(raw2).toContain('plaintext-accepted-with-caveat');
  });
});
