// Relay blob fetch — expired and unknown blobs are indistinguishable (404),
// so a blob id leaks nothing about its history (ADR-0009, ticket 19).
import { NextRequest, NextResponse } from 'next/server';
import { relayCore } from '@/lib/instances';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ blobId: string }> },
) {
  try {
    const { blobId } = await params;

    const origin = request.headers.get('origin');
    const host = request.headers.get('host') ?? '';
    if (!relayCore.isOriginAllowed(origin, host)) {
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
