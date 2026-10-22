// Ticket #41 — smoke tests for lib/instances.ts, the consolidated singleton
// module (cleanup ticket 40 / ADR-0012). These are smoke tests: they pin the
// identities, memoization, and fallback semantics that the app relies on —
// deep behavior lives in the per-module suites (relay-core, vault, storage).
import { describe, test, expect, afterAll } from 'bun:test';
import {
  relayCore,
  getOrCreateVault,
  getDmClient,
  getStorageKeyManager,
  getEncryptedHistoryStorage,
  resetHistoryStorage,
} from '../instances';

afterAll(() => {
  // The sweep timer is process-global by design; stop it so the test runner exits.
  const g = globalThis as unknown as { __relaySweepTimer?: ReturnType<typeof setInterval> };
  if (g.__relaySweepTimer) clearInterval(g.__relaySweepTimer);
});

describe('instances: RelayCore singleton (server-side seam)', () => {
  test('the exported relayCore IS the globalThis-pinned instance', () => {
    expect(relayCore).toBeDefined();
    expect(globalThis.globalRelayCore === relayCore).toBeTrue();
  });

  test('the pinned instance serves a room round-trip (what the API routes hit)', () => {
    const roomId = `smoke_${Date.now()}`;
    relayCore.upsertRoom({ id: roomId, name: 'smoke' });
    expect(relayCore.getRoom(roomId)).toBeDefined();
    expect(relayCore.join(roomId, { userId: 'u1', username: 'smoker' })).toBeGreaterThanOrEqual(0);
    expect(relayCore.hasMember(roomId, 'u1')).toBe(true);
    expect(relayCore.memberCount(roomId)).toBe(1);
    expect(relayCore.leave(roomId, 'u1')).toBe(true);
    expect(relayCore.hasMember(roomId, 'u1')).toBe(false);
  });

  test('sweepExpired() runs on the shared instance without throwing', () => {
    expect(relayCore.sweepExpired()).toBeGreaterThanOrEqual(0);
  });

  test('shared rate-limit budget is enforced through the singleton', () => {
    // burstSize 25 for 'send' per client key (ADR-0012 relay caps)
    let accepted = 0;
    for (let i = 0; i < 40; i++) if (relayCore.allowRequest('smoke-burst', 'send')) accepted++;
    expect(accepted).toBe(25);
  });
});

describe('instances: browser-side accessors (memoization + fallbacks)', () => {
  test('getStorageKeyManager memoizes one construction', () => {
    const a = getStorageKeyManager();
    const b = getStorageKeyManager();
    expect(a).toBe(b);
  });

  test('getEncryptedHistoryStorage resolves null (locked fallback) when no store is available', async () => {
    // In a non-browser environment IndexedDB is absent by design; the accessor
    // must degrade to null — never throw — and stay consistent across resets.
    expect(await getEncryptedHistoryStorage()).toBeNull();
    resetHistoryStorage();
    expect(await getEncryptedHistoryStorage()).toBeNull();
  });

  test('getOrCreateVault and getDmClient memoize a single attempt', () => {
    const v1 = getOrCreateVault();
    const v2 = getOrCreateVault();
    expect(v1).toBe(v2);
    const c1 = getDmClient();
    const c2 = getDmClient();
    expect(c1).toBe(c2);
    // Neither settles here (no IndexedDB in the test env); silence unhandled rejections.
    v1.catch(() => {});
    c1.catch(() => {});
  });
});
