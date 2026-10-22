// Tor bridge (ticket 25): the NARROW interface the app consumes for Tor
// status. The Electron-only control path (SOCKS proxying, control-port
// commands) lives behind lib/tor-integration; the web path degrades honestly
// through these status probes and never imports the Electron machinery.
// (One interface, two real implementations: web + Electron.)

export interface TorStatus {
  enabled: boolean;
  connected: boolean;
  /** Circuit hop labels for display; empty on the web path. */
  hops: string[];
}

export interface TorBridge {
  readonly kind: 'web' | 'electron';
  getStatus(): Promise<TorStatus>;
}

/** Web path: ask our own relay routes; no third-party endpoints (ADR wave 08). */
export class WebTorBridge implements TorBridge {
  readonly kind = 'web' as const;

  async getStatus(): Promise<TorStatus> {
    try {
      const resp = await fetch('/api/tor-status', { headers: { Accept: 'application/json' } });
      if (!resp.ok) return { enabled: false, connected: false, hops: [] };
      const body = (await resp.json()) as { torEnabled?: boolean; connected?: boolean };
      return {
        enabled: Boolean(body.torEnabled),
        connected: Boolean(body.connected),
        hops: [], // hop details never leave the Electron process
      };
    } catch {
      return { enabled: false, connected: false, hops: [] };
    }
  }
}

/** The active bridge: web by default; Electron shells install theirs at boot. */
let activeBridge: TorBridge = new WebTorBridge();

export function setTorBridge(bridge: TorBridge): void {
  activeBridge = bridge;
}

export function getTorBridge(): TorBridge {
  return activeBridge;
}
