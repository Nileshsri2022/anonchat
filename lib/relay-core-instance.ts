// Process-wide RelayCore singleton (survives dev HMR like roomRegistry).
import { RelayCore } from './relay-core';

declare global {
  var globalRelayCore: RelayCore | undefined;
}

export const relayCore: RelayCore =
  globalThis.globalRelayCore ||
  (globalThis.globalRelayCore = new RelayCore({
    payloadCapBytes: 64 * 1024,
    sendRatePerSec: 10,
    burstSize: 25,
    pollRatePerSec: 60,
    joinRatePerSec: 5,
  }));

// Periodic sweep of expired messages and stale replay windows.
if (typeof setInterval === 'function') {
  const g = globalThis as unknown as { __relaySweepTimer?: ReturnType<typeof setInterval> };
  if (!g.__relaySweepTimer) {
    g.__relaySweepTimer = setInterval(() => {
      relayCore.sweepExpired();
    }, 10_000);
  }
}
