// Ticket #23 — PWA shell: manifest sanity + service worker network-only API.
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'fs';
import { unreadTitle, UnreadBadge } from '../unread-badge';

const manifest = JSON.parse(readFileSync(new URL('../../public/manifest.json', import.meta.url), 'utf8'));
const sw = readFileSync(new URL('../../public/sw.js', import.meta.url), 'utf8');

describe('PWA shell (ticket 23)', () => {
  test('manifest parses and passes installability sanity checks', () => {
    expect(manifest.name).toContain('AnonChat');
    expect(manifest.short_name).toBe('AnonChat');
    expect(manifest.display).toBe('standalone');
    expect(manifest.start_url).toBe('/');
    expect(Array.isArray(manifest.icons) && manifest.icons.length > 0).toBe(true);
    for (const icon of manifest.icons) {
      expect(icon.src).toMatch(/^\/.*\.png$/);
      expect(icon.sizes).toMatch(/^\d+x\d+$/);
      expect(['any', 'maskable']).toContain(icon.purpose);
    }
    expect(manifest.theme_color ?? manifest.themeColor ?? '#0f172a').toBe('#0f172a');
  });

  test('service worker caches only the shell — /api is never cached', () => {
    // Explicit bypass guard for the relay API
    expect(sw).toContain("url.pathname.startsWith('/api/')");
    // No shell asset and no cached path points at the API
    expect(sw).not.toMatch(/SHELL_ASSETS\s*=\s*\[[^\]]*\/api/);
    expect(sw).not.toMatch(/cache\.addAll\(\s*\[[^\]]*'\/api/);
    // Navigations fall back to the cached shell, not an API route
    expect(sw).toContain("caches.match('/')");
  });

  test('unread tab-title badge: pure title math + badge lifecycle', () => {
    expect(unreadTitle('AnonChat', 0)).toBe('AnonChat');
    expect(unreadTitle('AnonChat', 3)).toBe('(3) AnonChat');

    const titles: string[] = [];
    const badge = new UnreadBadge('AnonChat', (t) => titles.push(t));
    badge.onHidden();
    badge.onIncoming();
    badge.onIncoming();
    expect(badge.count()).toBe(2);
    expect(titles.at(-1)).toBe('(2) AnonChat');
    badge.onVisible();
    expect(badge.count()).toBe(0);
    expect(titles.at(-1)).toBe('AnonChat');
    // Visible surface: incoming messages never badge
    badge.onIncoming();
    expect(badge.count()).toBe(0);
  });
});
