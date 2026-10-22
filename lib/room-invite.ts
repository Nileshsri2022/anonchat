// Room Invites: the out-of-band artifact carrying everything needed to join a Room.
// Random-key Rooms carry the Room Key inside the Invite (ADR-0003) — it must never
// pass through the Relay. Passphrase Rooms carry no key material: members derive
// the key from the shared Room Passphrase and verify via the Room Canary (ADR-0002).

export const ROOM_INVITE_PREFIX = 'anonchat-room-invite-v1:';

export interface RoomInvite {
  roomId: string;
  roomName: string;
  isProtected: boolean;
  /** Base64 AES-256 Room Key — present only for random-key Rooms. */
  keyB64?: string;
  createdAt: number;
}

/** Generates a fresh random Room Key (base64) on the creator's device. */
export async function createRoomKey(): Promise<string> {
  const raw = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(32)));
  return btoa(String.fromCharCode(...raw));
}

export function serializeRoomInvite(input: {
  roomId: string;
  roomName: string;
  keyB64?: string;
  isProtected?: boolean;
}): string {
  if (input.isProtected && input.keyB64) {
    throw new Error('A passphrase-protected Room Invite must not carry key material');
  }
  const invite: RoomInvite = {
    roomId: input.roomId,
    roomName: input.roomName,
    isProtected: Boolean(input.isProtected),
    keyB64: input.isProtected ? undefined : input.keyB64,
    createdAt: Date.now(),
  };
  return ROOM_INVITE_PREFIX + btoa(JSON.stringify(invite));
}

export function parseRoomInvite(invite: string): RoomInvite {
  const trimmed = invite.trim();
  if (!trimmed.startsWith(ROOM_INVITE_PREFIX)) {
    throw new Error('Not an AnonChat Room Invite (missing prefix)');
  }
  let json: unknown;
  try {
    json = JSON.parse(atob(trimmed.slice(ROOM_INVITE_PREFIX.length)));
  } catch {
    throw new Error('Room Invite payload is not valid');
  }
  const r = json as Partial<RoomInvite>;
  if (
    typeof r.roomId !== 'string' ||
    !r.roomId ||
    typeof r.roomName !== 'string' ||
    typeof r.isProtected !== 'boolean' ||
    (r.keyB64 !== undefined && (typeof r.keyB64 !== 'string' || !r.keyB64))
  ) {
    throw new Error('Room Invite payload is missing or has invalid fields');
  }
  return {
    roomId: r.roomId,
    roomName: r.roomName,
    isProtected: r.isProtected,
    keyB64: r.isProtected ? undefined : r.keyB64,
    createdAt: typeof r.createdAt === 'number' ? r.createdAt : 0,
  };
}
