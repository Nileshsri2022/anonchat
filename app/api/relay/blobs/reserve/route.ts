// Reserve a blob id before upload: the client needs the id to bind it into
// the attachment's AEAD additional data BEFORE encrypting (ADR-0009, ticket 20).
import { NextRequest, NextResponse } from 'next/server';
import { relayCore } from '@/lib/relay-core-instance';

export async function POST(request: NextRequest) {
  try {
    const origin = request.headers.get('origin');
    const host = request.headers.get('host') ?? '';
    if (!relayCore.isOriginAllowed(origin, host)) {
      return NextResponse.json({ error: 'Cross-origin requests are not allowed' }, { status: 403 });
    }

    const clientKey =
      request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      request.headers.get('x-real-ip') ||
      'unknown';
    const result = relayCore.reserveBlobId(clientKey);
    if (!result.accepted) {
      return NextResponse.json({ error: result.reason }, { status: 429 });
    }

    console.log('[relay] blob id reserved');
    return NextResponse.json({ success: true, blobId: result.blobId }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Failed to reserve blob id' }, { status: 500 });
  }
}
