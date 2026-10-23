// Client-side Blob Store access (ADR-0009, ticket 20): reserve ids, upload
// opaque ciphertext, download for decryption. All bodies are ciphertext —
// the relay learns nothing about content.
import type { AttachmentPayload } from './attachment-crypto';

export class BlobStoreError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'BlobStoreError';
  }
}

async function check(resp: Response, what: string): Promise<Response> {
  if (!resp.ok) {
    let reason = what;
    try {
      const body = (await resp.json()) as { error?: string };
      if (body.error) reason = body.error;
    } catch {
      // non-JSON error body
    }
    throw new BlobStoreError(reason, resp.status);
  }
  return resp;
}

/** Reserve a blob id (needed for the AEAD binding before encrypting). */
export async function reserveBlobId(): Promise<string> {
  const resp = await check(await fetch('/api/relay/blobs/reserve', { method: 'POST' }), 'reserve failed');
  const body = (await resp.json()) as { blobId: string };
  return body.blobId;
}

/**
 * Upload opaque ciphertext under the id that was reserved for it.
 *
 * The id must be the reserved one: it is bound into the attachment's AEAD
 * additional data before encrypting, so uploading anywhere else would store the
 * bytes under an id the message never references (ADR-0009).
 */
export async function uploadBlob(data: Uint8Array, blobId: string): Promise<string> {
  const resp = await check(
    await fetch(`/api/relay/blobs/${blobId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: data as unknown as BodyInit,
    }),
    'upload failed',
  );
  const body = (await resp.json()) as { blobId: string };
  return body.blobId || blobId;
}

/** Download the opaque blob for decryption; null when expired/gone (honest absence). */
export async function downloadBlob(payload: AttachmentPayload): Promise<Uint8Array<ArrayBuffer> | null> {
  const resp = await fetch(`/api/relay/blobs/${payload.blobId}`);
  if (resp.status === 404) return null; // expired or unknown — honest absence
  await check(resp, 'download failed');
  const buffer = await resp.arrayBuffer();
  const out = new Uint8Array(new ArrayBuffer(buffer.byteLength));
  out.set(new Uint8Array(buffer));
  return out;
}

/** Full send pipeline: reserve → encrypt → upload → message payload. */
export async function createAttachmentPayload(
  data: Uint8Array<ArrayBuffer>,
  meta: { name: string; mime: string; kind: 'file' | 'image' | 'voice'; durationMs?: number },
): Promise<AttachmentPayload> {
  const { encryptAttachment, attachmentToPayload } = await import('./attachment-crypto');
  const blobId = await reserveBlobId();
  const enc = await encryptAttachment(data, { name: meta.name, mime: meta.mime, blobId });
  await uploadBlob(enc.blobBytes, blobId);
  const payload: AttachmentPayload = {
    t: 'att',
    blobId,
    keyB64: enc.keyB64,
    ivB64: enc.ivB64,
    name: meta.name,
    size: data.byteLength,
    mime: meta.mime,
    kind: meta.kind,
    ...(meta.durationMs !== undefined ? { durationMs: meta.durationMs } : {}),
  };
  attachmentToPayload(payload); // shape sanity (throws on bad fields)
  return payload;
}

/** Full receive pipeline: download → authenticate+decrypt → bytes; null when gone. */
export async function resolveAttachmentPayload(
  payload: AttachmentPayload,
): Promise<Uint8Array<ArrayBuffer> | null> {
  const { decryptAttachment } = await import('./attachment-crypto');
  const blob = await downloadBlob(payload);
  if (!blob) return null;
  return decryptAttachment(blob, payload.keyB64, payload.ivB64, payload);
}
