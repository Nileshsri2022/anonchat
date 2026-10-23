// Tor status reporting: the circuit the UI shows must be a real three-hop one.
//
// A Tor daemon runs internal single-hop tunnels for onion services, reachability
// tests and directory fetches. Presenting one of those as "your circuit" claims
// anonymity the traffic does not have, which is the exact failure this app
// cannot afford. Parsing lives in lib so it can be checked without a daemon.
import { describe, test, expect } from 'bun:test';
import { createServer, type Server, type Socket } from 'node:net';

import { readTorStatus, selectCircuit } from '../tor-control';

/**
 * A stand-in for a Tor daemon. The control protocol is the thing under test —
 * multi-line `250-` replies, the terminating `250 ` line, and 5xx errors — and
 * this exercises all three without needing a real daemon in CI.
 */
function fakeTor(
  respond: (command: string) => string[],
  options: { errorOn?: string } = {},
): Promise<{ port: number; close: () => void; received: () => string[] }> {
  const seen: string[] = [];
  const server: Server = createServer((socket: Socket) => {
    socket.setEncoding('utf8');
    socket.on('data', (chunk: string) => {
      for (const line of chunk.split('\r\n').filter(Boolean)) {
        seen.push(line);
        if (options.errorOn && line.startsWith(options.errorOn)) {
          socket.write('515 Authentication failed\r\n');
          continue;
        }
        socket.write(respond(line).join('\r\n') + '\r\n');
      }
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      resolve({ port, close: () => server.close(), received: () => seen });
    });
  });
}

const BOOTSTRAP_DONE = ['250+status/bootstrap-phase=', '250-status/bootstrap-phase=NOTICE PROGRESS=100 TAG=done SUMMARY="Done"', '250 OK'];
const CIRCUITS = [
  '250+circuit-status=',
  `250-3 BUILT $AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA~guard,$BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB~middle,$CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC~exit BUILD_FLAGS=NEED_CAPACITY PURPOSE=GENERAL`,
  '250 OK',
];

const THREE_HOP = [
  '250+circuit-status=',
  '250-3 BUILT $AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA~guard,$BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB~middle,$CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC~exit BUILD_FLAGS=NEED_CAPACITY PURPOSE=GENERAL',
  '250 OK',
].join('\r\n');

describe('Tor control protocol', () => {
  test('S3: a bootstrapped daemon with a three-hop circuit reports routed', async () => {
    const tor = await fakeTor((command) => {
      if (command.startsWith('AUTHENTICATE')) return ['250 OK'];
      if (command.includes('bootstrap-phase')) return BOOTSTRAP_DONE;
      if (command.includes('circuit-status')) return CIRCUITS;
      return ['250 OK'];
    });

    try {
      const status = await readTorStatus({ controlPort: tor.port, timeoutMs: 2000 });
      expect(status.connected).toBe(true);
      expect(status.authenticated).toBe(true);
      expect(status.bootstrapProgress).toBe(100);
      expect(status.circuitEstablished).toBe(true);
      expect(status.circuit?.circuitId).toBe('3');
      expect(status.circuit?.hops.exit?.ip).toBe('CCCCCCCC');
    } finally {
      tor.close();
    }
  });

  test('S3: a daemon still bootstrapping is not reported as routed', async () => {
    const tor = await fakeTor((command) => {
      if (command.startsWith('AUTHENTICATE')) return ['250 OK'];
      if (command.includes('bootstrap-phase')) {
        return ['250+status/bootstrap-phase=', '250-status/bootstrap-phase=NOTICE PROGRESS=45 TAG=conn_or SUMMARY="Connecting"', '250 OK'];
      }
      return ['250 OK'];
    });

    try {
      const status = await readTorStatus({ controlPort: tor.port, timeoutMs: 2000 });
      expect(status.connected).toBe(true);
      expect(status.bootstrapProgress).toBe(45);
      expect(status.circuitEstablished).toBe(false);
      expect(status.circuit).toBeNull();
      expect(status.error).toContain('bootstrapping');
    } finally {
      tor.close();
    }
  });

  test('S3: a rejected AUTHENTICATE is reported, not silently assumed successful', async () => {
    const tor = await fakeTor(() => ['250 OK'], { errorOn: 'AUTHENTICATE' });

    try {
      const status = await readTorStatus({ controlPort: tor.port, timeoutMs: 2000 });
      expect(status.connected).toBe(true);
      expect(status.authenticated).toBe(false);
      expect(status.circuitEstablished).toBe(false);
    } finally {
      tor.close();
    }
  });

  test('S3: a daemon with only internal circuits reports no circuit', async () => {
    const tor = await fakeTor((command) => {
      if (command.startsWith('AUTHENTICATE')) return ['250 OK'];
      if (command.includes('bootstrap-phase')) return BOOTSTRAP_DONE;
      if (command.includes('circuit-status')) {
        return ['250+circuit-status=', '250-7 BUILT $DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD~dirauth BUILD_FLAGS=IS_INTERNAL,ONEHOP_TUNNEL PURPOSE=DIR_FETCH', '250 OK'];
      }
      return ['250 OK'];
    });

    try {
      const status = await readTorStatus({ controlPort: tor.port, timeoutMs: 2000 });
      expect(status.bootstrapProgress).toBe(100);
      expect(status.circuitEstablished).toBe(false);
      expect(status.error).toContain('no usable three-hop circuit');
    } finally {
      tor.close();
    }
  });
});

describe('Tor circuit selection', () => {
  test('S1: a three-hop general circuit is selected', () => {
    const circuit = selectCircuit(THREE_HOP);
    expect(circuit).not.toBeNull();
    expect(circuit!.circuitId).toBe('3');
    expect(circuit!.hops.guard).not.toBeNull();
    expect(circuit!.hops.exit).not.toBeNull();
  });

  test('S1: only a fingerprint prefix is surfaced, never the full hop identity', () => {
    const circuit = selectCircuit(THREE_HOP);
    expect(circuit!.hops.guard!.ip).toBe('AAAAAAAA');
    expect(circuit!.hops.guard!.ip).not.toBe('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
  });

  test('S2: a one-hop internal tunnel is not presented as a circuit', () => {
    const reply = [
      '250+circuit-status=',
      '250-7 BUILT $DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD~dirauth BUILD_FLAGS=IS_INTERNAL,ONEHOP_TUNNEL PURPOSE=DIR_FETCH',
      '250 OK',
    ].join('\r\n');
    expect(selectCircuit(reply)).toBeNull();
  });

  test('S2: an onion-service circuit is not presented as our circuit', () => {
    const reply = [
      '250+circuit-status=',
      '250-9 BUILT $EEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE~a,$FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF~b,$1111111111111111111111111111111111111111~c BUILD_FLAGS=IS_INTERNAL PURPOSE=HS_SERVICE_REND HS_STATE=HSR_CONNECTING',
      '250 OK',
    ].join('\r\n');
    expect(selectCircuit(reply)).toBeNull();
  });

  test('S2: a circuit still building is not presented as built', () => {
    const reply = [
      '250+circuit-status=',
      '250-11 EXTENDED $AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA~guard,$BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB~middle BUILD_FLAGS=NEED_CAPACITY PURPOSE=GENERAL',
      '250 OK',
    ].join('\r\n');
    expect(selectCircuit(reply)).toBeNull();
  });

  test('S1: an empty reply yields no circuit', () => {
    expect(selectCircuit('250 OK')).toBeNull();
  });
});

// Reachable only through readTorStatus; exercised here via an unreachable port,
// which is the state of every machine without a local Tor.
describe('Tor control status', () => {
  test('S1: with no daemon listening, it fails closed rather than guessing', async () => {
    const status = await readTorStatus({ controlPort: 1, timeoutMs: 500 });
    expect(status.connected).toBe(false);
    expect(status.authenticated).toBe(false);
    expect(status.circuitEstablished).toBe(false);
    expect(status.circuit).toBeNull();
    // The UI surfaces this verbatim, so it has to read as a reason.
    expect(status.error).toContain('Tor is not running');
  });

  test('S1: it never claims a circuit when the control port is closed', async () => {
    const status = await readTorStatus({ controlPort: 1, timeoutMs: 500 });
    expect(status.bootstrapProgress).toBe(0);
    expect(status.circuitEstablished).toBe(false);
  });
});
