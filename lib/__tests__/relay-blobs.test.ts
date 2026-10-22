// Ticket #19 — Relay blob store (ADR-0009)
// Opaque encrypted blobs: size cap, per-client rate limits, TTL sweep, zero metadata.
import { describe, test, expect } from 'bun:test';

import { RelayCore } from '../relay-core';

function bytes(n: number, fill = 0x61): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(n));
  out.fill(fill);
  return out;
}

describe('Relay blob store (ticket 19)', () => {
  test('S2: a blob round-trips byte-for-byte and gets an unguessable id', async () => {
    const relay = new RelayCore({ blobUploadsPerMin: 100 });
    const data = bytes(1024, 0x7f);
    const result = await relay.putBlob({ data, clientKey: 'client-1' });
    expect(result.accepted).toBe(true);
    const { blobId } = result as { accepted: true; blobId: string };
    expect(blobId).toBeTruthy();
    expect(blobId.length).toBeGreaterThanOrEqual(32); // 128-bit random, hex
    const fetched = await relay.getBlob(blobId);
    expect(fetched).not.toBeNull();
    expect(fetched!.data.length).toBe(1024);
    expect(Array.from(fetched!.data)).toEqual(Array.from(data));
  });

  test('S2: oversized blobs are rejected with an oversize reason', async () => {
    const relay = new RelayCore({ maxBlobBytes: 1024, blobUploadsPerMin: 100 });
    const oversize = await relay.putBlob({ data: bytes(2048), clientKey: 'client-big' });
    expect(oversize.accepted).toBe(false);
    if (!oversize.accepted) expect(oversize.reason).toMatch(/exceeds/i);
  });

  test('S2: uploads are rate limited per client', async () => {
    const relay = new RelayCore({ blobUploadsPerMin: 3, blobBurst: 3 });
    for (let i = 0; i < 3; i++) {
      await relay.putBlob({ data: bytes(16), clientKey: 'client-flood' });
    }
    const flooded = await relay.putBlob({ data: bytes(16), clientKey: 'client-flood' });
    expect(flooded.accepted).toBe(false);
    if (!flooded.accepted) expect(flooded.reason).toMatch(/rate/i);
    // A different client is unaffected
    const other = await relay.putBlob({ data: bytes(16), clientKey: 'client-other' });
    expect(other.accepted).toBe(true);
  });

  test('S2: expired blobs disappear via TTL and sweep', async () => {
    const relay = new RelayCore({ blobTtlMs: 50, blobUploadsPerMin: 100 });
    const put = await relay.putBlob({ data: bytes(16), clientKey: 'c' });
    if (!put.accepted) throw new Error('put should succeed');
    const blobId = put.blobId;
    expect(await relay.getBlob(blobId)).not.toBeNull();
    await new Promise((r) => setTimeout(r, 70));
    expect(await relay.getBlob(blobId)).toBeNull(); // lazily expired
    const swept = relay.sweepExpired();
    expect(swept).toBeGreaterThanOrEqual(0); // sweep handles blobs without error
    expect(await relay.getBlob(blobId)).toBeNull();
  });

  test('S2: unknown blob ids return null (no existence oracle beyond fetch)', async () => {
    const relay = new RelayCore({ blobUploadsPerMin: 100 });
    expect(await relay.getBlob('deadbeefdeadbeefdeadbeefdeadbeef')).toBeNull();
  });

  test('S2: blob records store no client-identifying metadata', async () => {
    const relay = new RelayCore({ blobUploadsPerMin: 100 });
    const put = await relay.putBlob({ data: bytes(16), clientKey: 'client-traceable' });
    if (!put.accepted) throw new Error('put should succeed');
    const blobId = put.blobId;
    const stored = (relay as unknown as { blobs: Map<string, Record<string, unknown>> }).blobs.get(blobId)!;
    const keys = Object.keys(stored);
    for (const key of keys) {
      expect(['data', 'createdAt', 'expiresAt', 'payloadHash']).toContain(key);
    }
    expect(JSON.stringify(stored)).not.toContain('client-traceable');
  });
});
