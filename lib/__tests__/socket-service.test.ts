// Ticket: inbound socket routing.
//
// A '*' handler receives every message (the DM client routes envelopes by their
// Pairwise Channel), but it used to swallow them: once a Direct Message had been
// opened, the '*' handler stayed registered for the life of the page and every
// Room message was handed to it and dropped. Routing is a pure function so the
// precedence rule can be locked down without a live socket.
import { describe, test, expect } from 'bun:test';

import { routeInboundMessage } from '../socket-service';

const seen: string[] = [];

describe('Socket inbound routing', () => {
  test('S1: a message goes to the handler for the current Room', () => {
    seen.length = 0;
    const handlers = new Map<string, (m: unknown) => void>([
      ['room-1', () => seen.push('room-1')],
    ]);
    routeInboundMessage(handlers, 'room-1', { id: 'm1' });
    expect(seen).toEqual(['room-1']);
  });

  test('S1: a "*" handler wins while it is registered', () => {
    seen.length = 0;
    const handlers = new Map<string, (m: unknown) => void>([
      ['room-1', () => seen.push('room-1')],
      ['*', () => seen.push('*')],
    ]);
    routeInboundMessage(handlers, 'room-1', { id: 'm1' });
    expect(seen).toEqual(['*']);
  });

  test('S3: after the "*" handler is removed, Room messages reach the Room again', () => {
    seen.length = 0;
    const handlers = new Map<string, (m: unknown) => void>([
      ['room-1', () => seen.push('room-1')],
      ['*', () => seen.push('*')],
    ]);
    // What socketService.offMessage('*') does on DM unmount.
    handlers.delete('*');
    routeInboundMessage(handlers, 'room-1', { id: 'm1' });
    expect(seen).toEqual(['room-1']);
  });

  test('S1: with no matching handler the message is dropped, not thrown', () => {
    seen.length = 0;
    expect(() => routeInboundMessage(new Map(), 'room-1', { id: 'm1' })).not.toThrow();
    expect(seen).toEqual([]);
  });
});
