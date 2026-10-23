// Tor control authentication.
//
// The control port is what makes this an anonymity app rather than a chat app
// wearing one: it is the channel that proves a circuit exists. It must not be
// open to whatever else shares the host.
//
// Tor's cookie file is the credential when the daemon was started with
// CookieAuthentication 1 (the container). Desktop builds start Tor with
// CookieAuthentication 0 and write no cookie, so an unauthenticated AUTHENTICATE
// is the correct command there. Detect rather than assume either.
import { readFile } from 'node:fs/promises';

const DEFAULT_COOKIE_PATH = '/var/lib/tor/control_auth_cookie';
const COOKIE_BYTES = 32;

/** Build the AUTHENTICATE command for this host's Tor daemon. */
export async function controlAuthenticateCommand(): Promise<string> {
  const cookiePath = process.env.TOR_CONTROL_COOKIE || DEFAULT_COOKIE_PATH;
  try {
    const cookie = await readFile(cookiePath);
    if (cookie.byteLength === COOKIE_BYTES) {
      return `AUTHENTICATE ${cookie.toString('hex').toUpperCase()}`;
    }
  } catch {
    // No readable cookie: either CookieAuthentication 0, or Tor is not running
    // here at all. Both are resolved by the connect/response that follows.
  }
  return 'AUTHENTICATE';
}
