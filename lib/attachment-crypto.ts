// Attachment crypto (ADR-0009, ticket 20): files and voice notes encrypt
// client-side with a random AES-256 key; the ciphertext uploads to the Relay
// blob store as an opaque Blob, and the key + iv + metadata travel INSIDE the
// encrypted message (DM payload or sender-chain room content). The AEAD
// additional data binds blobId + name + mime, so a relay-side blob swap or
// metadata lie fails authentication instead of rendering.

export interface AttachmentMeta {
  name: string;
  mime: string;
  blobId: string;
}

export interface EncryptedAttachment {
  blobBytes: Uint8Array<ArrayBuffer>;
  keyB64: string;
  ivB64: string;
}

export interface AttachmentPayload {
  t: 'att';
  blobId: string;
  keyB64: string;
  ivB64: string;
  name: string;
  size: number;
  mime: string;
  kind: 'file' | 'image' | 'voice';
  durationMs?: number; // voice notes
}

function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const raw = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function bytesToB64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function aadFor(meta: AttachmentMeta): Uint8Array<ArrayBuffer> {
  const encoded = new TextEncoder().encode(
    `anonchat-attachment-v1|${meta.blobId}|${meta.name}|${meta.mime}`,
  );
  const out = new Uint8Array(new ArrayBuffer(encoded.byteLength));
  out.set(encoded);
  return out;
}

export async function encryptAttachment(
  data: Uint8Array<ArrayBuffer>,
  meta: AttachmentMeta,
): Promise<EncryptedAttachment> {
  const rawKey = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(32)));
  const iv = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(12)));
  const key = await crypto.subtle.importKey('raw', rawKey, { name: 'AES-GCM' }, false, ['encrypt']);
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: aadFor(meta) },
    key,
    data,
  );
  return {
    blobBytes: new Uint8Array(encrypted), // ct||tag — the opaque Blob body
    keyB64: bytesToB64(rawKey),
    ivB64: bytesToB64(iv),
  };
}

export async function decryptAttachment(
  blobBytes: Uint8Array<ArrayBuffer>,
  keyB64: string,
  ivB64: string,
  meta: AttachmentMeta,
): Promise<Uint8Array<ArrayBuffer>> {
  const key = await crypto.subtle.importKey('raw', b64ToBytes(keyB64), { name: 'AES-GCM' }, false, ['decrypt']);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b64ToBytes(ivB64), additionalData: aadFor(meta) },
    key,
    blobBytes,
  );
  const out = new Uint8Array(new ArrayBuffer(decrypted.byteLength));
  out.set(new Uint8Array(decrypted));
  return out;
}

export function attachmentToPayload(payload: AttachmentPayload): string {
  return JSON.stringify(payload);
}

export function payloadToAttachment(json: string): AttachmentPayload {
  const parsed = JSON.parse(json) as Partial<AttachmentPayload>;
  if (
    parsed.t !== 'att' ||
    typeof parsed.blobId !== 'string' ||
    typeof parsed.keyB64 !== 'string' ||
    typeof parsed.ivB64 !== 'string' ||
    typeof parsed.name !== 'string' ||
    typeof parsed.size !== 'number' ||
    typeof parsed.mime !== 'string' ||
    (parsed.kind !== 'file' && parsed.kind !== 'image' && parsed.kind !== 'voice')
  ) {
    throw new Error('Malformed attachment payload');
  }
  return parsed as AttachmentPayload;
}
