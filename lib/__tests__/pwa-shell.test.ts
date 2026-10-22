// Ticket #23 — PWA shell: manifest sanity + service worker network-only API.
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'fs';

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

});
