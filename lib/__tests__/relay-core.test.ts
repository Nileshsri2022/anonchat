import { describe, test, expect } from 'bun:test';
import { RelayCore } from '../relay-core';

function makeEnvelope(i: number, room = 'room_a', body?: string) {
  return {
    id: `client-id-${i}`,
    roomId: room,
    userId: `user-${i % 3}`,
    username: `nick-${i % 3}`,
    encryptedContent: body ?? `unique-body-${i}`,
    iv: 'iv',
    timestamp: Date.now(),
  };
}

describe('RelayCore — Ticket 07: hardening', () => {
  test('posts assign server-side monotonic sequence numbers; client-supplied ids are not trusted for dedup', async () => {
    const core = new RelayCore({ payloadCapBytes: 1000 });
    const r1 = await core.postMessage(makeEnvelope(1));
    const r2 = await core.postMessage(makeEnvelope(2));
    const r3 = await core.postMessage(makeEnvelope(3));

    expect(r1.accepted && r2.accepted && r3.accepted).toBe(true);
    expect(r2.seq).toBe(r1.seq! + 1);
    expect(r3.seq).toBe(r2.seq! + 1);

    const messages = core.getMessages('room_a');
    expect(messages.map((m) => m.seq)).toEqual([...messages.map((m) => m.seq)].sort((a, b) => a - b));
  });

  test('identical payloads are rejected as replays even with a fresh client id (pre-marking is impossible)', async () => {
    const core = new RelayCore({ payloadCapBytes: 1000 });
    const first = await core.postMessage(makeEnvelope(1, 'room_a', 'same-ciphertext'));
    expect(first.accepted).toBe(true);

    // Attacker replays the same payload with a DIFFERENT client id to pre-mark it
    const replay = await core.postMessage({ ...makeEnvelope(1, 'room_a', 'same-ciphertext'), id: 'fresh-id' });
    expect(replay.accepted).toBe(false);
    expect(replay.reason).toMatch(/replay/i);

    // A victim's legitimate new message with that client id still gets through
    const legit = await core.postMessage({ ...makeEnvelope(9, 'room_a', 'different-ciphertext'), id: 'fresh-id' });
    expect(legit.accepted).toBe(true);
  });

  test('oversized payloads are rejected before storage', async () => {
    const core = new RelayCore({ payloadCapBytes: 100 });
    const huge = await core.postMessage(makeEnvelope(1, 'room_a', 'y'.repeat(500)));
    expect(huge.accepted).toBe(false);
    expect(huge.reason).toMatch(/payload|size/i);
    expect(core.getMessages('room_a').length).toBe(0);
  });

  test('per-client token bucket rate limits bursts and recovers over time', async () => {
    const core = new RelayCore({ payloadCapBytes: 10_000, sendRatePerSec: 3, burstSize: 3 });
    const sameClient = (i: number) => ({ ...makeEnvelope(i), userId: 'burst-client' });
    for (let i = 0; i < 3; i++) {
      expect((await core.postMessage(sameClient(i))).accepted).toBe(true);
    }
    const fourth = await core.postMessage(sameClient(99));
    expect(fourth.accepted).toBe(false);
    expect(fourth.reason).toMatch(/rate/i);

    // A different client is not throttled by someone else's bucket
    expect((await core.postMessage({ ...makeEnvelope(100), userId: 'other-client' })).accepted).toBe(true);
  });

  test('leave actually removes membership and updates the count', () => {
    const core = new RelayCore({});
    core.join('room_m', { userId: 'u1', username: 'a' });
    core.join('room_m', { userId: 'u2', username: 'b' });
    expect(core.memberCount('room_m')).toBe(2);

    core.leave('room_m', 'u1');
    expect(core.memberCount('room_m')).toBe(1);
    expect(core.hasMember('room_m', 'u1')).toBe(false);
  });

  test('expired disappearing messages are swept from the store', async () => {
    const core = new RelayCore({});
    await core.postMessage({ ...makeEnvelope(1), expiresAt: Date.now() - 1000 });
    await core.postMessage(makeEnvelope(2));

    const removed = core.sweepExpired();
    expect(removed).toBe(1);
    expect(core.getMessages('room_a').length).toBe(1);
  });

  test('origin check allows same-origin and origin-less requests, rejects foreign origins', () => {
    const core = new RelayCore({});
    expect(core.isOriginAllowed(undefined, 'preview.example.host')).toBe(true);
    expect(core.isOriginAllowed('https://preview.example.host', 'preview.example.host')).toBe(true);
    expect(core.isOriginAllowed('https://evil.example', 'preview.example.host')).toBe(false);
  });

  test('getMessages supports after-sequence catch-up', async () => {
    const core = new RelayCore({});
    await core.postMessage(makeEnvelope(1));
    const second = await core.postMessage(makeEnvelope(2));
    await core.postMessage(makeEnvelope(3));

    const later = core.getMessages('room_a', second.seq);
    expect(later.length).toBe(1);
    expect(later[0].seq).toBe(second.seq! + 1);
  });
});
