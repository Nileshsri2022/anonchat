// Transport seam (ticket 25): ONE interface for envelope delivery with TWO
// real adapters — Socket.IO push and REST polling against the Relay buffer —
// so delivery logic is written and tested once, not duplicated per hook.
// (Two adapters = a real seam; see the codebase-design vocabulary.)

export interface EnvelopeFrame {
  channelId: string;
  [key: string]: unknown;
}

export interface TransportAdapter {
  /** Begin delivering envelopes for the given rooms to the handler. */
  start(roomIds: string[], onEnvelope: (envelope: unknown) => void): Promise<void>;
  /** Stop delivering. Idempotent. */
  stop(): void;
  connected(): boolean;
  /** Which adapter is live ('socket' | 'poll') — mutable only on the fallback. */
  kind: 'socket' | 'poll';
}

/** A raw fetch into the Relay message buffer (kept injectable for tests). */
export type PollFn = (roomId: string) => Promise<unknown[]>;

/** REST polling adapter: long-lived interval with per-room dedup by wire id. */
export class PollTransport implements TransportAdapter {
  readonly kind = 'poll' as const;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly seen = new Set<string>();
  private active = false;

  constructor(
    private readonly rooms: () => string[],
    private readonly poll: PollFn,
    private readonly intervalMs = 5000,
  ) {}

  async start(_roomIds: string[], onEnvelope: (envelope: unknown) => void): Promise<void> {
    this.active = true;
    const tick = async () => {
      if (!this.active) return;
      for (const room of this.rooms()) {
        try {
          const frames = await this.poll(room);
          for (const frame of frames) {
            const id = (frame as { id?: string }).id ?? JSON.stringify(frame);
            if (this.seen.has(id)) continue;
            this.seen.add(id);
            if (this.seen.size > 5000) {
              const oldest = this.seen.values().next().value;
              if (oldest !== undefined) this.seen.delete(oldest);
            }
            onEnvelope(frame);
          }
        } catch {
          // transient network errors: keep polling
        }
      }
    };
    await tick();
    this.timer = setInterval(tick, this.intervalMs);
  }

  stop(): void {
    this.active = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  connected(): boolean {
    return this.active;
  }
}

/** Socket push adapter: delegates to an injectable subscribe/unsubscribe pair
 *  (the Socket.IO service in the app; a fake in tests). */
export class SocketTransport implements TransportAdapter {
  readonly kind = 'socket' as const;
  private onEnvelope: ((envelope: unknown) => void) | null = null;
  private subscribedRooms: string[] = [];
  private up = false;

  constructor(
    private readonly subscribe: (rooms: string[], handler: (frame: unknown) => void) => void,
    private readonly unsubscribe: (rooms: string[]) => void,
    private readonly isConnected: () => boolean,
  ) {}

  async start(roomIds: string[], onEnvelope: (envelope: unknown) => void): Promise<void> {
    this.onEnvelope = onEnvelope;
    this.subscribedRooms = roomIds;
    this.subscribe(roomIds, (frame) => this.onEnvelope?.(frame));
    this.up = true;
  }

  stop(): void {
    if (this.up) this.unsubscribe(this.subscribedRooms);
    this.up = false;
    this.onEnvelope = null;
  }

  connected(): boolean {
    return this.up && this.isConnected();
  }
}

/** The delivery policy the app actually uses: socket push when alive, poll
 *  otherwise — expressed ONCE, here, instead of duplicated in every hook. */
export class FallbackTransport implements TransportAdapter {
  kind: 'socket' | 'poll';
  private current: TransportAdapter;

  constructor(
    private readonly primary: TransportAdapter,
    private readonly secondary: TransportAdapter,
  ) {
    this.current = primary;
    this.kind = primary.kind;
  }

  async start(roomIds: string[], onEnvelope: (envelope: unknown) => void): Promise<void> {
    try {
      await this.primary.start(roomIds, onEnvelope);
      this.current = this.primary;
      this.kind = this.primary.kind;
    } catch {
      await this.secondary.start(roomIds, onEnvelope);
      this.current = this.secondary;
      this.kind = this.secondary.kind;
    }
  }

  stop(): void {
    this.primary.stop();
    this.secondary.stop();
  }

  connected(): boolean {
    return this.current.connected();
  }

  /** Fail over at runtime (e.g. socket disconnect detected). */
  async failOver(roomIds: string[], onEnvelope: (envelope: unknown) => void): Promise<void> {
    if (this.current === this.primary) {
      this.primary.stop();
      await this.secondary.start(roomIds, onEnvelope);
      this.current = this.secondary;
      this.kind = this.secondary.kind;
    }
  }
}
