// Liveness reporting for a deployed relay.
//
// The relay holds all of its state in memory by design (ADR-0009: nothing
// identifying is persisted), so a restart — or a free-tier spin-down — silently
// empties every Room. Reporting the process identity and start time turns that
// from a mystery into something an operator can actually see.
import { connect } from 'node:net';

import { relayCore } from './instances';

export interface TorPortProbe {
  control: boolean;
  socks: boolean;
}

export interface RelayHealth {
  status: 'ok';
  instanceId: string;
  startedAt: string;
  uptimeMs: number;
  tor: TorPortProbe;
  rooms: number;
}

/** Whether something is listening on a loopback port. Fails closed and fast. */
export function probeTcpPort(port: number, host = '127.0.0.1', timeoutMs = 800): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ port, host });
    const finish = (open: boolean) => {
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

declare global {
  var globalRelayInstance: { id: string; startedAt: number } | undefined;
}

const instance =
  globalThis.globalRelayInstance ||
  (globalThis.globalRelayInstance = { id: crypto.randomUUID(), startedAt: Date.now() });

export async function readRelayHealth(): Promise<RelayHealth> {
  const [control, socks] = await Promise.all([
    probeTcpPort(9051),
    probeTcpPort(9050),
  ]);

  return {
    status: 'ok',
    instanceId: instance.id,
    startedAt: new Date(instance.startedAt).toISOString(),
    uptimeMs: Date.now() - instance.startedAt,
    tor: { control, socks },
    rooms: relayCore.listRooms().length,
  };
}
