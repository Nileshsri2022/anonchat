// Ticket: DM catch-up over the relay buffer.
//
// The relay stores a fixed Relay Message shape (opaque ciphertext + iv), but a
// Direct Message travels as a Message Envelope. The client used to spread the
// envelope over a Relay Message, the route picked out only the fields it knows,
// and every envelope lost channelId/header/ciphertext on the way through — so
// `isEnvelope()` was false on the way out and offline DMs silently vanished.
// The encode/decode pair is the seam; the HTTP round-trip proves it.
import { describe, test, expect } from 'bun:test';
import { NextRequest } from 'next/server';

import {
  envelopeToRelayMessage,
  relayMessageToEnvelope,
  isRelayEnvelope,
} from '../dm-relay';
import { POST as postMessage, GET as getMessages } from '../../app/api/relay/rooms/[roomId]/messages/route';
import type { MessageEnvelope } from '../direct-message-session';

const ORIGIN = 'http://localhost:3000';

function envelope(over: Partial<MessageEnvelope> = {}): MessageEnvelope {
  return {
    version: 3,
    channelId: 'dm_channel',
    header: { dhPublic: 'DH-PUB', n: 3, pn: 0 },
    ciphertext: 'Q0lQSEVSVEVYVA==',
    iv: 'SVYtVU5JUVVF',
    tag: 'VEFH',
    timestamp: 1_700_000_000_000,
    ...over,
  };
}

describe('DM relay buffer (envelope <-> relay message)', () => {
  test('S1: an envelope survives the encode/decode pair', () => {
    const env = envelope();
    const back = relayMessageToEnvelope(envelopeToRelayMessage(env, {
      id: 'm1',
      roomId: 'dm_channel',
      userId: 'alice',
      username: 'Alice',
    }));
    expect(back).toEqual(env);
  });

  test('S1: a record that carries no envelope decodes to null rather than a guess', () => {
    expect(
      relayMessageToEnvelope({
        id: 'm1',
        roomId: 'r',
        userId: 'u',
        username: 'U',
        encryptedContent: 'not-json',
        iv: 'iv',
        timestamp: 0,
      }),
    ).toBeNull();
  });

  test('S3: an envelope posted to the relay comes back intact and usable', async () => {
    const roomId = `dm_${Math.random().toString(16).slice(2)}`;
    const env = envelope({ channelId: roomId, iv: `IV-${Math.random()}` });

    const post = await postMessage(
      new NextRequest(`${ORIGIN}/api/relay/rooms/${roomId}/messages`, {
        method: 'POST',
        body: JSON.stringify(
          envelopeToRelayMessage(env, { id: 'm1', roomId, userId: 'alice', username: 'Alice' }),
        ),
      }),
      { params: Promise.resolve({ roomId }) },
    );
    expect(post.status).toBe(200);

    const fetched = await getMessages(new NextRequest(`${ORIGIN}/api/relay/rooms/${roomId}/messages`), {
      params: Promise.resolve({ roomId }),
    });
    const rows = (await fetched.json()) as unknown[];
    expect(rows.length).toBe(1);
    expect(isRelayEnvelope(rows[0])).toBe(true);

    const restored = relayMessageToEnvelope(rows[0] as Parameters<typeof relayMessageToEnvelope>[0]);
    expect(restored).toEqual(env);
  });
});
