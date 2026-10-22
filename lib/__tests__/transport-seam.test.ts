// Ticket #25 — TransportAdapter seam: socket-push and REST-poll behind ONE
// interface, delivery logic tested once against a live RelayCore.
import { describe, test, expect } from 'bun:test';

import { RelayCore } from '../relay-core';
import { PollTransport, SocketTransport, FallbackTransport } from '../transport/transport-adapter';

describe('Transport seam (ticket 25)', () => {
  test('PollTransport delivers each relay-buffered envelope exactly once', async () => {
    const relay = new RelayCore();
    await relay.upsertRoom({ id: 'room_t', name: 'seam' });
    await relay.postMessage({
      id: 'm1', roomId: 'room_t', userId: 'u1', username: 'u1',
      encryptedContent: 'AAAA', iv: 'BBBB', timestamp: Date.now(),
    });
    await relay.postMessage({
      id: 'm2', roomId: 'room_t', userId: 'u2', username: 'u2',
      encryptedContent: 'CCCC', iv: 'DDDD', timestamp: Date.now(),
    });

    const delivered: string[] = [];
    const poll = new PollTransport(() => ['room_t'], async () => relay.getMessages('room_t'), 20);
    await poll.start(['room_t'], (frame) => delivered.push((frame as { id: string }).id));
    // a second tick re-polls the same buffer — dedup must hold
    await new Promise((r) => setTimeout(r, 50));
    poll.stop();

    expect(delivered.sort()).toEqual(['m1', 'm2']);
    expect(poll.connected()).toBe(false); // stopped
  });

  test('SocketTransport delivers pushed frames; FallbackTransport switches on failure', async () => {
    let handler: ((frame: unknown) => void) | null = null;
    let socketUp = true;
    const socket = new SocketTransport(
      (_rooms, h) => {
        handler = h;
      },
      () => {
        handler = null;
      },
      () => socketUp,
    );

    const viaSocket: string[] = [];
    await socket.start(['room_x'], (f) => viaSocket.push((f as { id: string }).id));
    handler!({ id: 'push1' });
    expect(viaSocket).toEqual(['push1']);
    expect(socket.connected()).toBe(true);
    socket.stop();
    expect(socket.connected()).toBe(false);

    // Fallback: primary throws on start → secondary (poll) takes over
    const relay = new RelayCore();
    await relay.upsertRoom({ id: 'room_y', name: 'fb' });
    await relay.postMessage({
      id: 'p1', roomId: 'room_y', userId: 'u', username: 'u',
      encryptedContent: 'AA', iv: 'BB', timestamp: Date.now(),
    });
    const brokenPrimary = new SocketTransport(
      () => {
        throw new Error('socket unavailable');
      },
      () => {},
      () => false,
    );
    const poll = new PollTransport(() => ['room_y'], async () => relay.getMessages('room_y'), 20);
    const fallback = new FallbackTransport(brokenPrimary, poll);
    const got: string[] = [];
    await fallback.start(['room_y'], (f) => got.push((f as { id: string }).id));
    expect(fallback.kind).toBe('poll'); // failed over
    await new Promise((r) => setTimeout(r, 40));
    fallback.stop();
    expect(got).toEqual(['p1']);
    expect(fallback.connected()).toBe(false);
  });
});
