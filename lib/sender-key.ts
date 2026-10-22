// Sender-Key chains (ADR-0008, ticket 17): per-(member, Room) forward-secure
// sending. A member's seed is distributed strictly pairwise over DM ratchets
// (the Room Key never touches it); messages ratchet a chain keyed by the seed.
//
//   chainKey_0  = HKDF(seed, info='anonchat-sk-chain')
//   messageKey_n = HKDF(chainKey_n, info='anonchat-sk-msg')
//   chainKey_n+1 = HKDF(chainKey_n, info='anonchat-sk-step')
//
// Consumed chain keys are dropped immediately (forward secrecy within a
// chain); receivers keep a bounded skip cache for out-of-order delivery and
// reject replays of consumed (epoch, n) pairs. The wire context
// (`context` = room id + sender identity) is bound as AEAD additional data.

export interface SenderKeyMessage {
  /** Chain epoch — increments on every rotation. */
  epoch: number;
  /** Message number within the epoch's chain. */
  n: number;
  iv: string;
  ciphertext: string;
}

export interface CreatedSenderKey {
  seedB64: string;
  ratchet: SenderKeyRatchet;
}

const CHAIN_INFO = 'anonchat-sk-chain';
const STEP_INFO = 'anonchat-sk-step';
const MSG_INFO = 'anonchat-sk-msg';
const MAX_SKIPPED = 100;
const MAX_CONSUMED = 1000;

function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const raw = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function bytesToB64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function copyBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(bytes.length));
  out.set(bytes);
  return out;
}

async function hkdf(ikm: Uint8Array<ArrayBuffer>, info: string, context: string): Promise<ArrayBuffer> {
  const base = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new TextEncoder().encode(context),
      info: new TextEncoder().encode(info),
    },
    base,
    256,
  );
}

async function aesKeyFrom(messageKey: ArrayBuffer): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', messageKey, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

function contextBytes(context: string): Uint8Array<ArrayBuffer> {
  const encoded = new TextEncoder().encode(context);
  const out = new Uint8Array(new ArrayBuffer(encoded.byteLength));
  out.set(encoded);
  return out;
}

export class SenderKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SenderKeyError';
  }
}

/** One member's sending (and, from a seed, receiving) chain for one Room. */
export class SenderKeyRatchet {
  private constructor(
    private chainKey: ArrayBuffer,
    private epoch: number,
    private messageNumber: number,
    private readonly skipped = new Map<string, ArrayBuffer>(),
    private readonly consumed = new Set<string>(),
  ) {}

  /** Receiver side: build a chain from a distributed seed. */
  static async forRemote(seedB64: string, epoch: number): Promise<SenderKeyRatchet> {
    const chainKey = await hkdf(b64ToBytes(seedB64), CHAIN_INFO, String(epoch));
    return new SenderKeyRatchet(chainKey, epoch, 0);
  }

  currentEpoch(): number {
    return this.epoch;
  }

  position(): number {
    return this.messageNumber;
  }

  /** Rotation (ADR-0008): fresh seed + epoch after membership changes. Returns
   *  the new seed for pairwise distribution; this ratchet keeps sending on the
   *  new epoch. Holders of the old seed cannot read the new epoch. */
  async rotate(): Promise<{ seedB64: string; epoch: number }> {
    const seedB64 = bytesToB64(crypto.getRandomValues(new Uint8Array(new ArrayBuffer(32))));
    this.epoch += 1;
    this.messageNumber = 0;
    this.chainKey = await hkdf(b64ToBytes(seedB64), CHAIN_INFO, String(this.epoch));
    return { seedB64, epoch: this.epoch };
  }

  /** Sender side: encrypt the next message on this member's chain. */
  async encrypt(plaintext: string, context: string): Promise<SenderKeyMessage> {
    const messageKey = await hkdf(new Uint8Array(this.chainKey), MSG_INFO, String(this.epoch));
    const nextChain = await hkdf(new Uint8Array(this.chainKey), STEP_INFO, String(this.epoch));
    this.chainKey = nextChain;
    const n = this.messageNumber++;

    const iv = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(12)));
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: contextBytes(context) },
      await aesKeyFrom(messageKey),
      new TextEncoder().encode(plaintext),
    );
    // subtle.encrypt returns ct||tag; base64 the whole thing in ONE string —
    // concatenating two padded base64 strings puts '=' mid-string and atob dies.
    return {
      epoch: this.epoch,
      n,
      iv: bytesToB64(iv),
      ciphertext: bytesToB64(new Uint8Array(encrypted)),
    };
  }

  /** Receiver side: decrypt a message from this member's chain. */
  async decrypt(message: SenderKeyMessage, context: string): Promise<string> {

    const consumedKey = `${message.epoch}:${message.n}`;
    if (this.consumed.has(consumedKey)) {
      throw new SenderKeyError(`Replay rejected (${consumedKey} already consumed)`);
    }

    let messageKey: ArrayBuffer | undefined = this.skipped.get(consumedKey);
    if (messageKey) {
      this.skipped.delete(consumedKey);
    } else if (message.epoch !== this.epoch) {
      throw new SenderKeyError(`Message from unknown epoch ${message.epoch} (local epoch ${this.epoch})`);
    } else if (message.n < this.messageNumber) {
      throw new SenderKeyError(`Message ${message.n} is below the receive pointer (evicted or consumed)`);
    } else {
      // Skip forward, caching every intermediate message key for out-of-order arrival
      while (this.messageNumber < message.n) {
        const skippedKey = await hkdf(new Uint8Array(this.chainKey), MSG_INFO, String(this.epoch));
        const nextChain = await hkdf(new Uint8Array(this.chainKey), STEP_INFO, String(this.epoch));
        this.chainKey = nextChain;
        this.skipped.set(`${this.epoch}:${this.messageNumber}`, skippedKey);
        if (this.skipped.size > MAX_SKIPPED) {
          const oldest = this.skipped.keys().next().value;
          if (oldest !== undefined) this.skipped.delete(oldest);
        }
        this.messageNumber++;
      }
      messageKey = await hkdf(new Uint8Array(this.chainKey), MSG_INFO, String(this.epoch));
      const nextChain = await hkdf(new Uint8Array(this.chainKey), STEP_INFO, String(this.epoch));
      this.chainKey = nextChain;
      this.messageNumber++;
    }

    let decrypted: ArrayBuffer;
    try {
      decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: b64ToBytes(message.iv), additionalData: contextBytes(context) },
        await aesKeyFrom(messageKey),
        b64ToBytes(message.ciphertext), // already ct||tag
      );
    } catch {
      throw new SenderKeyError('Sender-key message failed authentication (wrong key or context)');
    }

    this.consumed.add(consumedKey);
    if (this.consumed.size > MAX_CONSUMED) {
      const oldest = this.consumed.values().next().value;
      if (oldest !== undefined) this.consumed.delete(oldest);
    }
    return new TextDecoder().decode(decrypted);
  }
}

/** Sender side: create this member's Sender Key for a Room (the seed is what
 *  gets distributed pairwise over DM ratchets — never through the Relay). */
export async function createSenderKey(): Promise<CreatedSenderKey> {
  const seedB64 = bytesToB64(crypto.getRandomValues(new Uint8Array(new ArrayBuffer(32))));
  return { seedB64, ratchet: await SenderKeyRatchet.forRemote(seedB64, 0) };
}
