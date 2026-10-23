// RelayCore: the zero-knowledge relay's entire state and rules, framework-free.
// Invariant (CODING_STANDARDS.md): opaque ciphertext only — no key material, no
// plaintext, no passphrases ever touch this code. Hardening (ticket 07):
// payload caps, per-client token buckets, payload-hash replay protection with
// server-assigned sequence numbers, real membership removal, expiry sweeps,
// same-origin enforcement, and identifier-free logging.

export interface RelayMessage {
  id: string;
  roomId: string;
  userId: string;
  username: string;
  encryptedContent: string;
  iv: string;
  timestamp: number;
  ip?: string;
  expiresAt?: number;
  /** Server-assigned monotonic sequence within the room. */
  seq: number;
}

export interface PostResult {
  accepted: boolean;
  seq?: number;
  reason?: string;
}

export interface RelayCoreOptions {
  payloadCapBytes?: number;
  sendRatePerSec?: number;
  burstSize?: number;
  pollRatePerSec?: number;
  joinRatePerSec?: number;
  replayWindowMs?: number;
  /** Max blob size in bytes (default 10 MiB). */
  maxBlobBytes?: number;
  /** Blob uploads per minute per client (default 10). */
  blobUploadsPerMin?: number;
  /** Burst allowance for blob uploads (default = blobUploadsPerMin). */
  blobBurst?: number;
  /** Blob time-to-live in ms (default 7 days). */
  blobTtlMs?: number;
}

export type PutBlobResult =
  | { accepted: true; blobId: string }
  | { accepted: false; reason: string };

export interface FetchedBlob {
  data: Uint8Array<ArrayBuffer>;
}

interface StoredBlob {
  data: Uint8Array<ArrayBuffer>;
  createdAt: number;
  expiresAt: number;
}

interface StoredMessage extends RelayMessage {
  payloadHash: string;
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function newBlobId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

class TokenBucket {
  private tokens: number;
  private last: number;

  constructor(private ratePerSec: number, private burst: number) {
    this.tokens = burst;
    this.last = Date.now();
  }

  tryTake(): boolean {
    const now = Date.now();
    const elapsed = (now - this.last) / 1000;
    this.tokens = Math.min(this.burst, this.tokens + elapsed * this.ratePerSec);
    this.last = now;
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }
    return false;
  }
}

export class RelayCore {
  private readonly payloadCapBytes: number;
  private readonly sendRatePerSec: number;
  private readonly burstSize: number;
  private readonly pollRatePerSec: number;
  private readonly joinRatePerSec: number;
  private readonly replayWindowMs: number;

  private rooms = new Map<string, { id: string; name?: string; isProtected: boolean; canary?: unknown; createdAt: number; userCount: number }>();
  private members = new Map<string, Map<string, { userId: string; username: string; joinedAt?: number }>>();
  private messages = new Map<string, StoredMessage[]>();
  private seqCounters = new Map<string, number>();
  private seenPayloads = new Map<string, number>(); // payloadHash -> expiry
  private readonly blobs = new Map<string, StoredBlob>();
  private readonly maxBlobBytes: number;
  private readonly blobUploadsPerMin: number;
  private readonly blobBurst: number;
  private readonly blobTtlMs: number;
  private buckets = new Map<string, TokenBucket>();
  private nextSeq = 1;

  constructor(options: RelayCoreOptions = {}) {
    this.payloadCapBytes = options.payloadCapBytes ?? 64 * 1024;
    this.sendRatePerSec = options.sendRatePerSec ?? 10;
    this.burstSize = options.burstSize ?? 20;
    this.pollRatePerSec = options.pollRatePerSec ?? 60;
    this.maxBlobBytes = options.maxBlobBytes ?? 10 * 1024 * 1024;
    this.blobUploadsPerMin = options.blobUploadsPerMin ?? 10;
    this.blobBurst = options.blobBurst ?? (options.blobUploadsPerMin ?? 10);
    this.blobTtlMs = options.blobTtlMs ?? 7 * 24 * 60 * 60 * 1000;
    this.joinRatePerSec = options.joinRatePerSec ?? 5;
    this.replayWindowMs = options.replayWindowMs ?? 3 * 24 * 60 * 60 * 1000;
  }

  // --- Anti-abuse ------------------------------------------------------------

  private bucketFor(clientKey: string, kind: 'send' | 'poll' | 'join' | 'blob'): TokenBucket {
    const key = `${kind}:${clientKey}`;
    let bucket = this.buckets.get(key);
    if (!bucket) {
      const rate =
        kind === 'send'
          ? this.sendRatePerSec
          : kind === 'poll'
            ? this.pollRatePerSec
            : kind === 'blob'
              ? this.blobUploadsPerMin / 60
              : this.joinRatePerSec;
      bucket = new TokenBucket(
        rate,
        kind === 'send' ? this.burstSize : kind === 'blob' ? this.blobBurst : Math.max(5, rate),
      );
      this.buckets.set(key, bucket);
    }
    return bucket;
  }

  allowRequest(clientKey: string, kind: 'send' | 'poll' | 'join' | 'blob'): boolean {
    return this.bucketFor(clientKey, kind).tryTake();
  }

  /** Same-origin enforcement: allow same-host and origin-less (non-CORS) requests. */
  isOriginAllowed(origin: string | undefined | null, host: string): boolean {
    if (!origin) return true;
    try {
      return new URL(origin).host === host;
    } catch {
      return false;
    }
  }

  // --- Rooms & membership ------------------------------------------------------

  upsertRoom(room: { id: string; name?: string; isProtected?: boolean; canary?: unknown }): void {
    const existing = this.rooms.get(room.id);
    if (existing) return;
    this.rooms.set(room.id, {
      id: room.id,
      name: room.name,
      isProtected: Boolean(room.isProtected && room.canary),
      canary: room.isProtected ? room.canary : undefined,
      createdAt: Date.now(),
      userCount: 0,
    });
  }

  getRoom(roomId: string) {
    return this.rooms.get(roomId);
  }

  /**
   * Rooms this relay currently knows about, newest first, with the live member
   * count from the membership map. The relay is the authority on membership: the
   * read-only metadata registry can drift from it after a restart.
   */
  listRooms(): Array<{ id: string; name?: string; isProtected: boolean; createdAt: number; userCount: number }> {
    return [...this.rooms.values()]
      .map((room) => ({ ...room, userCount: this.members.get(room.id)?.size ?? 0 }))
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  join(roomId: string, member: { userId: string; username: string; joinedAt?: number }): number {
    let set = this.members.get(roomId);
    if (!set) {
      set = new Map();
      this.members.set(roomId, set);
    }
    set.set(member.userId, member);
    const room = this.rooms.get(roomId);
    if (room) room.userCount = set.size;
    return set.size;
  }

  leave(roomId: string, userId: string): boolean {
    const set = this.members.get(roomId);
    if (!set) return false;
    const removed = set.delete(userId);
    const room = this.rooms.get(roomId);
    if (room) room.userCount = set.size;
    return removed;
  }

  memberCount(roomId: string): number {
    return this.members.get(roomId)?.size ?? 0;
  }

  hasMember(roomId: string, userId: string): boolean {
    return this.members.get(roomId)?.has(userId) ?? false;
  }

  // --- Messages ----------------------------------------------------------------

  /** Hash-dedup + cap + rate-limit + server-side sequence, then store. */
  async postMessage(
    message: Omit<RelayMessage, 'seq'>,
    clientKey = message.userId,
  ): Promise<PostResult> {
    const size = new TextEncoder().encode(message.encryptedContent ?? '').length;
    if (size > this.payloadCapBytes) {
      return { accepted: false, reason: `payload exceeds ${this.payloadCapBytes} byte cap` };
    }
    if (!this.allowRequest(clientKey, 'send')) {
      return { accepted: false, reason: 'rate limit exceeded' };
    }

    const payloadHash = await sha256Hex(`${message.iv}|${message.encryptedContent}`);
    const now = Date.now();
    const seenExpiry = this.seenPayloads.get(payloadHash);
    if (seenExpiry !== undefined && seenExpiry > now) {
      return { accepted: false, reason: 'replay detected (identical payload already accepted)' };
    }

    const seq = this.nextSeq++;
    const roomId = message.roomId;
    const list = this.messages.get(roomId) ?? [];
    list.push({ ...message, seq, payloadHash });
    this.messages.set(roomId, list);
    this.seenPayloads.set(payloadHash, now + this.replayWindowMs);

    // Cap per-room backlog
    if (list.length > 500) list.splice(0, list.length - 500);
    return { accepted: true, seq };
  }

  /** The server-assigned sequence for a stored message id, if present. */
  seqOf(roomId: string, messageId: string): number | null {
    const list = this.messages.get(roomId) ?? [];
    return list.find((m) => m.id === messageId)?.seq ?? null;
  }

  /** Messages in sequence order; `afterSeq` returns only newer ones. */
  getMessages(roomId: string, afterSeq?: number): StoredMessage[] {
    const now = Date.now();
    let list = (this.messages.get(roomId) ?? []).filter((m) => !m.expiresAt || m.expiresAt > now);
    if (afterSeq !== undefined) list = list.filter((m) => m.seq > afterSeq);
    return [...list].sort((a, b) => a.seq - b.seq);
  }

  /** Removes expired messages and stale replay windows. Returns removed count. */
  /**
   * Reserve a blob id before upload: clients need the id to bind it into the
   * attachment's AEAD additional data BEFORE encrypting, so one upload
   * suffices (ADR-0009). Reservation counts against the same rate limit.
   */
  reserveBlobId(clientKey: string): { accepted: true; blobId: string } | { accepted: false; reason: string } {
    if (!this.allowRequest(clientKey, 'blob')) {
      return { accepted: false, reason: 'blob upload rate limit exceeded' };
    }
    const blobId = newBlobId();
    const now = Date.now();
    this.blobs.set(blobId, { data: new Uint8Array(new ArrayBuffer(0)), createdAt: now, expiresAt: now + this.blobTtlMs });
    return { accepted: true, blobId };
  }

  /**
   * Store an opaque encrypted blob (ADR-0009). The Relay never inspects or
   * attributes the payload; records hold only the data and its timestamps —
   * ids are already unguessable, so no content hash is kept.
   *
   * Passing `blobId` fills a reservation made by `reserveBlobId`. A reservation
   * may be filled exactly once: an id that already holds bytes is refused, so a
   * second upload cannot silently swap the ciphertext out from under a message
   * that already references it.
   */
  putBlob(input: { data: Uint8Array; clientKey: string; blobId?: string }): PutBlobResult {
    if (input.data.byteLength > this.maxBlobBytes) {
      return { accepted: false, reason: `blob exceeds ${this.maxBlobBytes} byte cap` };
    }
    if (!this.allowRequest(input.clientKey, 'blob')) {
      return { accepted: false, reason: 'blob upload rate limit exceeded' };
    }
    const existing = input.blobId ? this.blobs.get(input.blobId) : undefined;
    if (existing && existing.data.byteLength > 0) {
      return { accepted: false, reason: 'blob id already finalised' };
    }
    const blobId = input.blobId ?? newBlobId();
    const now = Date.now();
    this.blobs.set(blobId, {
      data: (() => {
        const out = new Uint8Array(new ArrayBuffer(input.data.byteLength));
        out.set(input.data);
        return out;
      })(),
      createdAt: now,
      expiresAt: now + this.blobTtlMs,
    });
    return { accepted: true, blobId };
  }

  /** Fetch a blob by id; expired, unknown and still-empty blobs are indistinguishable (null). */
  async getBlob(blobId: string): Promise<FetchedBlob | null> {
    const blob = this.blobs.get(blobId);
    if (!blob) return null;
    if (blob.expiresAt <= Date.now()) {
      this.blobs.delete(blobId);
      return null;
    }
    // An id that was reserved but never uploaded to is not an attachment.
    // Serving it as a 0-byte success would make every download look fine while
    // AEAD authentication fails at the receiving end (ADR-0009).
    if (blob.data.byteLength === 0) return null;
    return { data: blob.data };
  }

  sweepExpired(): number {
    const now = Date.now();
    let removed = 0;
    for (const [roomId, list] of this.messages) {
      const kept = list.filter((m) => {
        if (m.expiresAt && m.expiresAt <= now) {
          removed++;
          return false;
        }
        return true;
      });
      this.messages.set(roomId, kept);
    }
    for (const [hash, expiry] of this.seenPayloads) {
      if (expiry <= now) this.seenPayloads.delete(hash);
    }
    for (const [blobId, blob] of this.blobs) {
      if (blob.expiresAt <= now) {
        this.blobs.delete(blobId);
        removed++;
      }
    }
    return removed;
  }

  /** Identifier-free log line: no room ids, usernames, user ids, or IPs. */
  static safeLog(event: string): string {
    return `[relay] ${event}`;
  }
}
