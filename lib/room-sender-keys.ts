// Ticket #18 — Room rewire (ADR-0008): the Room Key protects exactly one
// Intro per member; all room content rides per-sender Sender-Key chains
// distributed strictly pairwise over DM ratchets. Late joiners start at the
// distributor's current chain position (startN) — history stays unreadable.
import { SenderKeyRatchet, type SenderKeyMessage, createSenderKey } from './sender-key';
import type { IdentityBundle } from './identity-bundle';

/** What travels INSIDE the Room-Key-encrypted intro (one per member, ever):
 *  the full Identity Bundle (so members can open pairwise DM channels for
 *  Sender-Key distribution) plus the optional self-chosen Display Name. */
export interface IntroPayload {
  t: 'intro';
  bundle: IdentityBundle;
  name?: string;
}

/** Pairwise Sender-Key distribution — travels INSIDE a DM ratchet envelope. */
export interface SenderKeyDistribution {
  t: 'skd';
  roomId: string;
  epoch: number;
  seed: string;
  /** The sender's current chain position: receivers start HERE (no history). */
  startN: number;
  from: string;
}

/** Pairwise leave announcement — travels INSIDE a DM ratchet envelope. */
export interface LeaveAnnouncement {
  t: 'leave';
  roomId: string;
  from: string;
}

/** A room content message: per-sender chain, sender-attributed on the wire
 *  (chain selection requires it; full room-attribution sealing is deferred —
 *  see ADR-0008 amendment). */
export interface RoomContentMessage {
  t: 'msg';
  roomId: string;
  from: string;
  msg: SenderKeyMessage;
}

export type RoomWirePayload = RoomContentMessage | ({ t: 'leave-room' } & LeaveAnnouncement);

export interface RoomMemberInfo {
  identitySpkiB64: string;
  signingSpkiB64: string;
  displayName?: string;
  /** True once the pairwise SAS has been recorded for this member. */
  sasVerified: boolean;
}

const CONTENT_CTX = (roomId: string, from: string) => `anonchat-room-msg-v1|${roomId}|${from}`;

function parse<T extends { t: string }>(json: string, want: T['t'], what: string): T {
  const parsed = JSON.parse(json) as { t?: string } & Record<string, unknown>;
  if (parsed.t !== want) throw new Error(`Expected ${what} payload, got "${parsed.t ?? 'unknown'}"`);
  return parsed as unknown as T;
}

export class RoomSenderKeyCoordinator {
  private readonly memberRegistry = new Map<string, RoomMemberInfo>();
  private readonly remoteRatchets = new Map<string, SenderKeyRatchet>();
  private introSent = false;

  private constructor(
    readonly roomId: string,
    readonly selfIdentitySpkiB64: string,
    private readonly selfSigningSpkiB64: string,
    private readonly selfDisplayName: string | undefined,
    private mySeed: string,
    private myRatchet: SenderKeyRatchet,
    private readonly selfSasVerified = true,
  ) {}

  private selfBundle: IdentityBundle | undefined;

  /** A member joining/creating a room: fresh Sender Key for this room. */
  static async create(
    roomId: string,
    selfIdentitySpkiB64: string,
    selfSigningSpkiB64: string,
    displayName?: string,
  ): Promise<RoomSenderKeyCoordinator> {
    const created = await createSenderKey();
    return new RoomSenderKeyCoordinator(
      roomId,
      selfIdentitySpkiB64,
      selfSigningSpkiB64,
      displayName,
      created.seedB64,
      created.ratchet,
    );
  }

  /** Attach our own Identity Bundle (needed for the intro; ADR-0008). */
  setSelfBundle(bundle: IdentityBundle): void {
    this.selfBundle = bundle;
  }

  /** The one Intro Message this member ever posts (Room-Key encrypted by the caller). */
  makeIntroPayload(): IntroPayload {
    if (!this.selfBundle) {
      throw new Error('Coordinator needs its Identity Bundle before it can intro');
    }
    this.introSent = true;
    return { t: 'intro', bundle: this.selfBundle, name: this.selfDisplayName };
  }

  /** Register a member from their decrypted intro. Self-intros are ignored. */
  onIntroPayload(json: string): RoomMemberInfo | null {
    const intro = parse<IntroPayload>(json, 'intro', 'intro');
    const ik = intro.bundle.identityPublicKeySpkiB64;
    if (ik.trim() === this.selfIdentitySpkiB64.trim()) return null;
    const member: RoomMemberInfo = {
      identitySpkiB64: ik,
      signingSpkiB64: intro.bundle.identitySigningPublicKeySpkiB64,
      displayName: intro.name,
      sasVerified: false,
    };
    this.memberRegistry.set(ik, member);
    return member;
  }

  /** The Identity Bundle a member's intro carried (for opening the pairwise DM). */
  introBundleOf(json: string): IdentityBundle | null {
    const intro = parse<IntroPayload>(json, 'intro', 'intro');
    if (intro.bundle.identityPublicKeySpkiB64.trim() === this.selfIdentitySpkiB64.trim()) return null;
    return intro.bundle;
  }

  /** The pairwise DM control content announcing our Sender Key to ONE member.
   *  Late joiners get a watermark at our current position (no history, ADR-0008);
   *  rotation redistribution to REMAINING members sets includeHistory so the
   *  whole new epoch is readable to them. */
  async distributionFor(
    memberIdentitySpkiB64: string,
    opts?: { includeHistory?: boolean },
  ): Promise<string> {
    const dist: SenderKeyDistribution = {
      t: 'skd',
      roomId: this.roomId,
      epoch: this.myRatchet.currentEpoch(),
      seed: this.mySeed,
      startN: opts?.includeHistory ? 0 : this.myRatchet.position(),
      from: this.selfIdentitySpkiB64,
    };
    void memberIdentitySpkiB64;
    return JSON.stringify(dist);
  }

  /** Install a member's Sender Key from a pairwise DM distribution payload. */
  async onDistribution(json: string): Promise<RoomMemberInfo | null> {
    const dist = parse<SenderKeyDistribution>(json, 'skd', 'sender-key distribution');
    if (dist.roomId !== this.roomId) throw new Error('Distribution is for a different room');
    if (dist.from.trim() === this.selfIdentitySpkiB64.trim()) return null;
    const ratchet = await SenderKeyRatchet.forRemote(dist.seed, dist.epoch);
    // No-history enforcement (ADR-0008): jump past everything sent before we
    // joined — positions below the watermark are consumed and undecryptable,
    // even if the relay replays its buffer at us.
    await ratchet.advanceTo(dist.startN);
    this.remoteRatchets.set(dist.from, ratchet);
    const existing = this.memberRegistry.get(dist.from);
    if (existing) return existing;
    const member: RoomMemberInfo = {
      identitySpkiB64: dist.from,
      signingSpkiB64: '',
      sasVerified: false,
    };
    this.memberRegistry.set(dist.from, member);
    return member;
  }

  /** Mark a member's pairwise SAS as recorded (clears the Unverified Badge). */
  markSasVerified(memberIdentitySpkiB64: string): void {
    const member = this.memberRegistry.get(memberIdentitySpkiB64);
    if (member) member.sasVerified = true;
  }

  members(): RoomMemberInfo[] {
    return [...this.memberRegistry.values()];
  }

  memberInfo(identitySpkiB64: string): RoomMemberInfo | undefined {
    return this.memberRegistry.get(identitySpkiB64);
  }

  /** Encrypt room content on this member's sender chain. */
  async encryptContent(text: string): Promise<string> {
    const msg = await this.myRatchet.encrypt(text, CONTENT_CTX(this.roomId, this.selfIdentitySpkiB64));
    const wire: RoomContentMessage = { t: 'msg', roomId: this.roomId, from: this.selfIdentitySpkiB64, msg };
    return JSON.stringify(wire);
  }

  /** Decrypt room content from a member's sender chain (authenticated by chain possession). */
  async decryptContent(json: string): Promise<{ text: string; from: string; verified: boolean }> {
    const wire = parse<RoomContentMessage>(json, 'msg', 'room content');
    if (wire.roomId !== this.roomId) throw new Error('Content is for a different room');
    if (wire.from.trim() === this.selfIdentitySpkiB64.trim()) {
      throw new Error('Self message reached the coordinator (self-echo should be filtered upstream)');
    }
    const ratchet = this.remoteRatchets.get(wire.from);
    if (!ratchet) throw new Error(`No sender chain installed for ${wire.from.slice(0, 8)}… (no pairwise distribution yet)`);
    const text = await ratchet.decrypt(wire.msg, CONTENT_CTX(this.roomId, wire.from));
    return { text, from: wire.from, verified: this.memberRegistry.get(wire.from)?.sasVerified ?? false };
  }

  /** A pairwise leave announcement arrived: rotate this member's Sender Key. */
  async onLeaveAnnounced(json: string): Promise<{ departed: string; newEpoch: number; newSeed: string }> {
    const leave = parse<LeaveAnnouncement>(json, 'leave', 'leave announcement');
    if (leave.roomId !== this.roomId) throw new Error('Leave is for a different room');
    this.memberRegistry.delete(leave.from);
    this.remoteRatchets.delete(leave.from);
    // Fresh epoch: the departed member holds no seed for it and gets no distribution.
    const rotated = await this.myRatchet.rotate();
    this.mySeed = rotated.seedB64;
    return { departed: leave.from, newEpoch: rotated.epoch, newSeed: rotated.seedB64 };
  }

  /** The pairwise leave announcement THIS member posts when departing. */
  async leaveAnnouncementFor(memberIdentitySpkiB64: string): Promise<string> {
    void memberIdentitySpkiB64;
    const leave: LeaveAnnouncement = { t: 'leave', roomId: this.roomId, from: this.selfIdentitySpkiB64 };
    return JSON.stringify(leave);
  }

  get selfVerified(): boolean {
    return this.selfSasVerified;
  }
}

/** Per-room coordinator registry (module scope — one per joined Room per tab). */
const coordinators = new Map<string, RoomSenderKeyCoordinator>();

export function registerRoomCoordinator(coordinator: RoomSenderKeyCoordinator): void {
  coordinators.set(coordinator.roomId, coordinator);
}

export function roomCoordinator(roomId: string): RoomSenderKeyCoordinator | undefined {
  return coordinators.get(roomId);
}
