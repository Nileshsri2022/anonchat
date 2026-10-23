'use client';

import { useEffect, useState } from 'react';

export interface TorStatusState {
  /** The relay's Tor control port answered at all. */
  connected: boolean;
  /** A circuit is built, so traffic is actually being routed. */
  routed: boolean;
  /** Still asking; UI must not claim either way until this is false. */
  loading: boolean;
}

const POLL_MS = 30_000;

/**
 * Whether this relay is actually routing through Tor.
 *
 * Everything that displays a Tor claim must read it from here. The previous
 * behaviour was to assume "connected" whenever the page loaded, which reported
 * anonymity the relay did not have.
 */
export function useTorStatus(): TorStatusState {
  const [state, setState] = useState<TorStatusState>({
    connected: false,
    routed: false,
    loading: true,
  });

  useEffect(() => {
    let active = true;

    const check = async () => {
      try {
        const response = await fetch('/api/tor-status');
        const data = (await response.json()) as {
          connected?: boolean;
          circuitEstablished?: boolean;
          bootstrapProgress?: number;
        };
        if (!active) return;
        setState({
          connected: Boolean(data.connected),
          routed: Boolean(data.connected && data.circuitEstablished),
          loading: false,
        });
      } catch {
        if (!active) return;
        setState({ connected: false, routed: false, loading: false });
      }
    };

    void check();
    const timer = setInterval(check, POLL_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  return state;
}
