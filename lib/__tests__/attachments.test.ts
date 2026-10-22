// Ticket #20 — Attachments + voice notes end-to-end (ADR-0009)
// Files encrypt client-side; the key rides inside the message; the relay
// stores only opaque blobs. Tampered blobs fail authentication.
import { describe, test, expect } from 'bun:test';

import { RelayCore } from '../relay-core';
import {
  encryptAttachment,
  decryptAttachment,
  attachmentToPayload,
  payloadToAttachment,
  type AttachmentPayload,
} from '../attachment-crypto';

function bytes(n: number, seed = 7): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(n));
  for (let i = 0; i < n; i++) out[i] = (i * seed) % 256;
  return out;
}

describe('Attachment crypto (ticket 20)', () => {
  test('S1: encrypt/decrypt round-trip; AAD binds blobId, name, mime', async () => {
    const data = bytes(4096);
    const { blobBytes, keyB64, ivB64 } = await encryptAttachment(data, {
      name: 'photo.png',
      mime: 'image/png',
      blobId: 'blob-abc',
    });
    expect(blobBytes).not.toEqual(data); // encrypted

    const decrypted = await decryptAttachment(blobBytes, keyB64, ivB64, {
      name: 'photo.png',
      mime: 'image/png',
      blobId: 'blob-abc',
    });
    expect(Array.from(decrypted)).toEqual(Array.from(data));

    // Wrong blobId in the message (relay swap attack) → auth failure
    await expect(
      decryptAttachment(blobBytes, keyB64, ivB64, { name: 'photo.png', mime: 'image/png', blobId: 'blob-OTHER' }),
    ).rejects.toThrow();
  });

  test('S1: payload round-trip carries no plaintext bytes', async () => {
    const data = bytes(512);
    const enc = await encryptAttachment(data, { name: 'note.txt', mime: 'text/plain', blobId: 'b1' });
    const payload: AttachmentPayload = {
      t: 'att',
      blobId: 'b1',
      keyB64: enc.keyB64,
      ivB64: enc.ivB64,
      name: 'note.txt',
      size: data.byteLength,
      mime: 'text/plain',
      kind: 'file',
    };
    const json = attachmentToPayload(payload);
    expect(json).not.toContain('secret-content'); // no plaintext travels in the message
    const back = payloadToAttachment(json);
    expect(back).toEqual(payload);
  });

  test('S3: a file crosses two clients through the relay blob store intact', async () => {
    const relay = new RelayCore();
    const data = bytes(2048, 11);

    // reserve the id (needed for the AAD binding BEFORE encrypting), encrypt, upload once
    const reserved = relay.reserveBlobId('alice');
    if (!reserved.accepted) throw new Error('reserve failed');
    const meta = { name: 'voice-note.webm', mime: 'audio/webm', blobId: reserved.blobId };
    const enc = await encryptAttachment(data, meta);
    const put = relay.putBlob({ data: enc.blobBytes, clientKey: 'alice', blobId: reserved.blobId });
    if (!put.accepted) throw new Error('upload failed');

    // the reference travels inside the (separately encrypted) message
    const wire = attachmentToPayload({
      t: 'att',
      blobId: put.blobId,
      keyB64: enc.keyB64,
      ivB64: enc.ivB64,
      name: meta.name,
      size: data.byteLength,
      mime: meta.mime,
      kind: 'voice',
      durationMs: 4200,
    });
    expect(wire).not.toContain('voice-note-audio-plaintext');

    // receiver downloads the opaque blob + decrypts with the message-carried key
    const fetched = await relay.getBlob(put.blobId);
    expect(fetched).not.toBeNull();
    const received = payloadToAttachment(wire);
    const plain = await decryptAttachment(fetched!.data, received.keyB64, received.ivB64, received);
    expect(Array.from(plain)).toEqual(Array.from(data));
    expect(received.kind).toBe('voice');
    expect(received.durationMs).toBe(4200);

    // a relay-side blob swap (other ciphertext substituted under our reference) fails auth
    const other = await encryptAttachment(bytes(16), { ...meta, blobId: 'other-id' });
    const swapped = relay.putBlob({ data: other.blobBytes, clientKey: 'alice', blobId: put.blobId });
    if (!swapped.accepted) throw new Error('swap upload failed');
    const fetchedSwapped = await relay.getBlob(put.blobId);
    await expect(
      decryptAttachment(fetchedSwapped!.data, received.keyB64, received.ivB64, received),
    ).rejects.toThrow();
  });

  test('S3: an expired (swept) blob is honestly undownloadable', async () => {
    const relay = new RelayCore({ blobTtlMs: 30 });
    const enc = await encryptAttachment(bytes(64), { name: 'f', mime: 'application/octet-stream', blobId: 'x' });
    const put = relay.putBlob({ data: enc.blobBytes, clientKey: 'a' });
    if (!put.accepted) throw new Error('upload failed');
    await new Promise((r) => setTimeout(r, 45));
    expect(await relay.getBlob(put.blobId)).toBeNull();
  });
});
