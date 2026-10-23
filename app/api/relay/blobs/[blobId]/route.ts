// Relay blob fetch + fill (ADR-0009, ticket 19/20).
//
// GET: expired, unknown and never-filled blobs are indistinguishable (404), so
// a blob id leaks nothing about its history.
// PUT: fills the reservation made by /api/relay/blobs/reserve, so the bytes land
// under the very id the client bound into the attachment's AEAD additional data.
import { NextRequest, NextResponse } from 'next/server';
import { relayCore } from '@/lib/instances';

function clientKeyOf(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  return forwarded?.split(',')[0].trim() || request.headers.get('x-real-ip') || 'unknown';
}

function sameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  const host = request.headers.get('host') ?? '';
  return relayCore.isOriginAllowed(origin, host);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ blobId: string }> },
) {
  try {
    const { blobId } = await params;

    if (!sameOrigin(request)) {
      return NextResponse.json({ error: 'Cross-origin requests are not allowed' }, { status: 403 });
    }

    const clientKey =
      request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      request.headers.get('x-real-ip') ||
      'unknown';
    if (!relayCore.allowRequest(clientKey, 'poll')) {
      return NextResponse.json({ error: 'rate limit exceeded' }, { status: 429 });
    }

    const blob = await relayCore.getBlob(blobId);
    if (!blob) {
      return NextResponse.json({ error: 'blob not found or expired' }, { status: 404 });
    }

    return new NextResponse(blob.data as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch blob' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ blobId: string }> },
) {
  try {
    const { blobId } = await params;

    if (!sameOrigin(request)) {
      return NextResponse.json({ error: 'Cross-origin requests are not allowed' }, { status: 403 });
    }

    const data = new Uint8Array(await request.arrayBuffer());
    if (data.byteLength === 0) {
      return NextResponse.json({ error: 'empty blob' }, { status: 400 });
    }

    const result = relayCore.putBlob({ data, clientKey: clientKeyOf(request), blobId });
    if (!result.accepted) {
      const status = result.reason.includes('rate')
        ? 429
        : result.reason.includes('finalis')
          ? 409
          : 413;
      return NextResponse.json({ error: result.reason }, { status });
    }

    console.log('[relay] blob filled');
    return NextResponse.json({ success: true, blobId: result.blobId }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Failed to store blob' }, { status: 500 });
  }
}
