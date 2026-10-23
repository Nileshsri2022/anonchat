// A minimal Tor control protocol client.
//
// The previous status probe scraped one growing string buffer for substrings,
// which meant a stray "250 OK" or a partially-arrived reply could send the state
// machine down the wrong branch. The control protocol is line-oriented and
// self-terminating, so read it that way: a reply ends on the first line whose
// fourth character is a space.
//
// Nothing here logs circuit contents. A relay that reports on its own anonymity
// must not also write it to disk.
import { connect, type Socket } from 'node:net';

import { controlAuthenticateCommand } from './tor-control-auth';

export interface TorCircuitHop {
  nickname: string;
  ip: string;
  country: string;
}

export interface TorCircuit {
  guard: TorCircuitHop | null;
  middle: TorCircuitHop | null;
  exit: TorCircuitHop | null;
}

export interface TorControlStatus {
  /** The control port answered at all. */
  connected: boolean;
  /** AUTHENTICATE succeeded. */
  authenticated: boolean;
  /** Bootstrap finished. Traffic is not yet proven to be routed at this point. */
  bootstrapProgress: number;
  /** A three-hop circuit is built, so traffic is genuinely routed. */
  circuitEstablished: boolean;
  circuit: { circuitId: string; hops: TorCircuit } | null;
  error?: string;
}

export interface TorControlOptions {
  controlPort?: number;
  host?: string;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 5000;

interface CircuitLine {
  id: string;
  path: string[];
  metadata: string;
}

/**
 * Internal single-hop tunnels exist for onion services, circuit build tests and
 * directory fetches. Showing one of those as "your circuit" would be a lie about
 * where traffic goes, so they are filtered out.
 */
function isGeneralPurposeCircuit(line: CircuitLine): boolean {
  if (line.path.length < 3) return false;
  const meta = line.metadata.toUpperCase();
  if (meta.includes('IS_INTERNAL')) return false;
  if (meta.includes('HS_STATE')) return false;
  if (meta.includes('HS_SERVICE')) return false;
  if (meta.includes('ONEHOP_TUNNEL')) return false;
  return true;
}

function parseCircuitStatus(reply: string): CircuitLine[] {
  return reply
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    // Every reply line carries a four-character status prefix: "250-", "250+",
    // or the terminating "250 ". Circuit data lives after it.
    .filter((line) => line.startsWith('250-') || line.startsWith('250+'))
    .map((line) => line.slice(4))
    .filter((line) => line.length > 0 && !line.startsWith('circuit-status'))
    .map((line) => {
      const [id, status, path, ...rest] = line.split(' ');
      return { id, status, path: path ?? '', metadata: rest.join(' ') };
    })
    .filter((line) => line.status === 'BUILT')
    .map((line) => ({
      id: line.id,
      path: line.path
        .split(',')
        .map((hop) => hop.match(/\$([A-F0-9]+)/i)?.[1] ?? '')
        .filter(Boolean),
      metadata: line.metadata,
    }));
}

/**
 * Pick the circuit the UI may present as "ours" from a `circuit-status` reply.
 *
 * Exported for testing: this is the decision that decides whether the app claims
 * to be routed, and it is far easier to get wrong than to notice.
 */
export function selectCircuit(reply: string): { circuitId: string; hops: TorCircuit } | null {
  const active = parseCircuitStatus(reply).find(isGeneralPurposeCircuit);
  if (!active) return null;
  return {
    circuitId: active.id,
    hops: {
      guard: hopFrom(active.path[0]),
      middle: hopFrom(active.path[1]),
      exit: hopFrom(active.path[2]),
    },
  };
}

function hopFrom(fingerprint: string | undefined): TorCircuitHop | null {
  if (!fingerprint) return null;
  // Only the fingerprint prefix is surfaced: it identifies the hop to the user
  // without giving the relay's logs (or a screenshot) a full node identity.
  return { nickname: 'Unknown', ip: fingerprint.slice(0, 8), country: 'Unknown' };
}

class TorControlClient {
  private buffer = '';
  private pending: { resolve: (reply: string) => void; reject: (error: Error) => void } | null = null;

  constructor(
    private readonly socket: Socket,
    private readonly timeoutMs: number,
  ) {
    socket.on('data', (chunk: Buffer) => this.onData(chunk.toString('utf8')));
  }

  private onData(chunk: string) {
    this.buffer += chunk;
    if (!this.pending) return;
    // A reply terminates on a line of the form "250 <text>"; continuation lines
    // look like "250-<text>".
    const complete = this.buffer.split(/\r?\n/).some((line) => /^(\d{3}) /.test(line));
    if (!complete) return;
    const reply = this.buffer;
    this.buffer = '';
    const pending = this.pending;
    this.pending = null;
    if (/^(4|5)\d\d /.test(reply.trim()) || /^\s*(4|5)\d\d /.test(reply)) {
      pending.reject(new Error(`Tor control error: ${reply.trim().split(/\r?\n/)[0]}`));
      return;
    }
    pending.resolve(reply);
  }

  send(command: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending = null;
        reject(new Error(`Tor control timed out waiting for a reply to ${command.split(' ')[0]}`));
      }, this.timeoutMs);
      this.pending = {
        resolve: (reply) => {
          clearTimeout(timer);
          resolve(reply);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      };
      this.socket.write(`${command}\r\n`);
    });
  }

  close() {
    this.socket.destroy();
  }
}

function connectSocket(host: string, port: number, timeoutMs: number): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = connect({ host, port });
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => resolve(socket));
    socket.once('timeout', () => {
      socket.destroy();
      reject(new Error('Timed out connecting to the Tor control port'));
    });
    socket.once('error', (error: NodeJS.ErrnoException) => {
      socket.destroy();
      reject(
        new Error(
          error.code === 'ECONNREFUSED'
            ? 'Tor is not running: nothing is listening on the control port'
            : `Cannot reach the Tor control port: ${error.message}`,
        ),
      );
    });
  });
}

/** Ask the local Tor daemon what it is actually doing. Fails closed, never guesses. */
export async function readTorStatus(options: TorControlOptions = {}): Promise<TorControlStatus> {
  const host = options.host ?? '127.0.0.1';
  const port = options.controlPort ?? Number(process.env.TOR_CONTROL_PORT ?? 9051);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const status: TorControlStatus = {
    connected: false,
    authenticated: false,
    bootstrapProgress: 0,
    circuitEstablished: false,
    circuit: null,
  };

  let socket: Socket | undefined;
  try {
    socket = await connectSocket(host, port, timeoutMs);
    status.connected = true;

    const client = new TorControlClient(socket, timeoutMs);
    await client.send(await controlAuthenticateCommand());
    status.authenticated = true;

    const bootstrap = await client.send('GETINFO status/bootstrap-phase');
    status.bootstrapProgress = Number(bootstrap.match(/PROGRESS=(\d+)/)?.[1] ?? 0);

    if (status.bootstrapProgress < 100) {
      status.error = `Tor is bootstrapping (${status.bootstrapProgress}%)`;
      client.close();
      return status;
    }

    const circuit = selectCircuit(await client.send('GETINFO circuit-status'));

    if (!circuit) {
      status.error = 'Tor is bootstrapped but has no usable three-hop circuit';
      client.close();
      return status;
    }

    status.circuitEstablished = true;
    status.circuit = circuit;

    client.close();
    return status;
  } catch (error) {
    socket?.destroy();
    status.error = error instanceof Error ? error.message : 'Unknown Tor control error';
    return status;
  }
}
