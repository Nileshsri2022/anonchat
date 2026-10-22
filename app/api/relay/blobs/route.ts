// Relay blob endpoint — opaque encrypted attachments (ADR-0009, ticket 19):
// size cap (413), per-client rate limits (429), TTL expiry, identifier-free logs.
// The body is raw ciphertext bytes; the Relay never inspects or attributes them.
import { NextRequest, NextResponse } from 'next/server';
import { relayCore } from '@/lib/relay-core-instance';

function clientKeyOf(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  return forwarded?.split(',')[0].trim() || request.headers.get('x-real-ip') || 'unknown';
}

export async function POST(request: NextRequest) {
  try {
    const origin = request.headers.get('origin');
    const host = request.headers.get('host') ?? '';
    if (!relayCore.isOriginAllowed(origin, host)) {
      return NextResponse.json({ error: 'Cross-origin requests are not allowed' }, { status: 403 });
    }

    const declaredLength = Number(request.headers.get('content-length') ?? '0');
    const maxBytes = 10 * 1024 * 1024;
    if (declaredLength > maxBytes) {
      return NextResponse.json({ error: `blob exceeds ${maxBytes} byte cap` }, { status: 413 });
    }

    const data = new Uint8Array(await request.arrayBuffer());
    if (data.byteLength === 0) {
      return NextResponse.json({ error: 'empty blob' }, { status: 400 });
    }

    const result = await relayCore.putBlob({ data, clientKey: clientKeyOf(request) });
    if (!result.accepted) {
      const status = result.reason.includes('rate') ? 429 : 413;
      return NextResponse.json({ error: result.reason }, { status });
    }

    console.log('[relay] blob accepted');
    return NextResponse.json({ success: true, blobId: result.blobId }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Failed to store blob' }, { status: 500 });
  }
}
