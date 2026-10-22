// Encrypted Outbox (ADR-0010, ticket 24): messages composed while offline are
// queued and SEALED under the Profile Passphrase storage key (same scheme as
// history — the honest plaintext caveat applies when no passphrase is set).
// Flush on reconnect with per-item retry state; nothing is silently dropped.
import { StorageKeyManager } from './storage-key';
import type { KVStore } from './kv-store';

export const OUTBOX_RECORD_KEY = 'anonchat_outbox_v1';
const MAX_ATTEMPTS = 50;

export interface OutboxItem {
  id: string;
  channelId: string;
  content: string;
  createdAt: number;
  attempts: number;
  state: 'pending' | 'failed';
}

interface SealedRecord {
  version: 1;
  ivB64: string;
  ciphertextB64: string;
}

function bytesToB64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const raw = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export interface FlushResult {
  sent: number;
  failed: number;
}

/** A generic transport entry point: (roomId, envelope) as everywhere else. */
export type OutboxFlushTransport = (
  roomId: string,
  envelope: unknown,
  item: OutboxItem,
) => Promise<void>;

export class Outbox {
  private queue: OutboxItem[] = [];
  private key: CryptoKey | null;

  constructor(
    private readonly kv: KVStore,
    key: CryptoKey | null,
  ) {
    this.key = key;
  }

  /** Attach after unlock/seal changes (the key arrives with the session). */
  setKey(key: CryptoKey | null): void {
    this.key = key;
  }

  async load(): Promise<void> {
    if (!this.key) return; // sealed/locked: nothing accessible by design
    const record = (await this.kv.get(OUTBOX_RECORD_KEY)) as SealedRecord | undefined;
    if (!record?.ciphertextB64) {
      this.queue = [];
      return;
    }
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: b64ToBytes(record.ivB64) },
      this.key,
      b64ToBytes(record.ciphertextB64),
    );
    this.queue = JSON.parse(new TextDecoder().decode(plain)) as OutboxItem[];
  }

  private async persist(): Promise<void> {
    if (!this.key) throw new Error('Outbox has no storage key; cannot persist');
    if (this.queue.length === 0) {
      await this.kv.delete(OUTBOX_RECORD_KEY);
      return;
    }
    const iv = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(12)));
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      this.key,
      new TextEncoder().encode(JSON.stringify(this.queue)),
    );
    const record: SealedRecord = {
      version: 1,
      ivB64: bytesToB64(iv),
      ciphertextB64: bytesToB64(new Uint8Array(encrypted)),
    };
    await this.kv.set(OUTBOX_RECORD_KEY, record);
  }

  async enqueue(input: { channelId: string; content: string }): Promise<OutboxItem> {
    const item: OutboxItem = {
      id: `out_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      channelId: input.channelId,
      content: input.content,
      createdAt: Date.now(),
      attempts: 0,
      state: 'pending',
    };
    this.queue.push(item);
    await this.persist();
    return item;
  }

  /** Flush pending items in order; failures mark the item and keep the queue. */
  async flush(transport: OutboxFlushTransport): Promise<FlushResult> {
    let sent = 0;
    let failed = 0;
    const remaining: OutboxItem[] = [];
    for (const item of this.queue) {
      if (item.attempts >= MAX_ATTEMPTS) {
        failed += 1; // dead-lettered in place: visible, never silently dropped
        remaining.push(item);
        continue;
      }
      try {
        item.attempts += 1;
        await transport(item.channelId, { content: item.content }, item);
        sent += 1;
      } catch {
        item.state = 'failed';
        failed += 1;
        remaining.push(item);
      }
    }
    this.queue = remaining;
    await this.persist(); // state changed (sends removed, attempts/failed updated)
    return { sent, failed };
  }

  count(): number {
    return this.queue.length;
  }

  items(): OutboxItem[] {
    return [...this.queue];
  }
}

/** Convenience: the session Outbox over the app-wide storage key. */
export async function getOutbox(): Promise<Outbox> {
  const { IndexedDBKVStore } = await import('./kv-store');
  const { getStorageKeyManager } = await import('./instances');
  const kv = new IndexedDBKVStore();
  try {
    const manager = await getStorageKeyManager();
    const key = await manager.getOrCreate();
    const outbox = new Outbox(kv, key);
    await outbox.load();
    return outbox;
  } catch {
    // sealed + locked: an inaccessible-but-persistent queue (still honest)
    return new Outbox(kv, null);
  }
}

// Re-exported so callers can wire lock/unlock without another import path.
export { StorageKeyManager };
