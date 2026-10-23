// Ticket 19/20 regression — the attachment upload must land under the id the
// client reserved. The RelayCore seam alone cannot catch this bug: `putBlob`
// honours an explicit `blobId`, so the unit tests passed while every real
// upload went to a freshly minted id the client never saw. The seam that was
// broken is the HTTP one, so that is where this test lives.
import { describe, test, expect } from 'bun:test';
import { NextRequest } from 'next/server';

import { PUT } from '../../app/api/relay/blobs/[blobId]/route';
import { GET as getBlob } from '../../app/api/relay/blobs/[blobId]/route';
import { POST as reserve } from '../../app/api/relay/blobs/reserve/route';

const ORIGIN = 'http://localhost:3000';

function reserveRequest(): NextRequest {
  return new NextRequest(`${ORIGIN}/api/relay/blobs/reserve`, { method: 'POST' });
}

function uploadRequest(blobId: string, data: Uint8Array): NextRequest {
  const req = new NextRequest(`${ORIGIN}/api/relay/blobs/${blobId}`, {
    method: 'PUT',
    body: data as unknown as BodyInit,
  });
  // NextRequest ignores the body's byte length for content-length in this
  // harness; the route measures the decoded buffer, which is what we want.
  return req;
}

async function reservedId(): Promise<string> {
  const res = await reserve(reserveRequest());
  expect(res.status).toBe(201);
  return ((await res.json()) as { blobId: string }).blobId;
}

describe('Relay blob upload over HTTP (ticket 20 regression)', () => {
  test('S3: the reserved id holds the bytes that were uploaded for it', async () => {
    const blobId = await reservedId();
    const data = new Uint8Array([9, 8, 7, 6, 5, 4, 3, 2, 1, 0]);

    const up = await PUT(uploadRequest(blobId, data), { params: Promise.resolve({ blobId }) });
    expect(up.status).toBe(201);

    const down = await getBlob(new NextRequest(`${ORIGIN}/api/relay/blobs/${blobId}`), {
      params: Promise.resolve({ blobId }),
    });
    expect(down.status).toBe(200);

    const fetched = new Uint8Array(await down.arrayBuffer());
    expect(fetched.byteLength).toBe(data.byteLength);
    expect(Array.from(fetched)).toEqual(Array.from(data));
  });

  test('S2: an empty reservation is not downloadable as a real attachment', async () => {
    const blobId = await reservedId();
    const down = await getBlob(new NextRequest(`${ORIGIN}/api/relay/blobs/${blobId}`), {
      params: Promise.resolve({ blobId }),
    });
    // A reservation that was never filled must not look like a 0-byte success.
    expect(down.status).toBe(404);
  });

  test('S2: a finalised id cannot be overwritten (fill-once)', async () => {
    const blobId = await reservedId();
    const first = await PUT(uploadRequest(blobId, new Uint8Array([1, 1, 1])), {
      params: Promise.resolve({ blobId }),
    });
    expect(first.status).toBe(201);

    const second = await PUT(uploadRequest(blobId, new Uint8Array([2, 2, 2])), {
      params: Promise.resolve({ blobId }),
    });
    expect(second.status).toBe(409);

    const down = await getBlob(new NextRequest(`${ORIGIN}/api/relay/blobs/${blobId}`), {
      params: Promise.resolve({ blobId }),
    });
    expect(Array.from(new Uint8Array(await down.arrayBuffer()))).toEqual([1, 1, 1]);
  });

  test('S2: an empty upload is rejected', async () => {
    const blobId = await reservedId();
    const res = await PUT(uploadRequest(blobId, new Uint8Array(0)), {
      params: Promise.resolve({ blobId }),
    });
    expect(res.status).toBe(400);
  });
});
