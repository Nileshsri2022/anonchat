# Deploying the AnonChat relay

How the relay reaches Render, what it needs from the environment, and how to
prove a deployment actually works once it is up.

`docs/DEPLOYMENT.md` covers the Electron release process. This document is the
web relay.

---

## What gets deployed

One process: `server.js`, a custom Next.js server with Socket.IO attached to the
same HTTP server. It serves the app **and** the relay API from a single origin,
which is why the client can use relative URLs (`/api/relay/...`) and why the
relay can hold both transports to one origin rule.

```
anonchat-relay.onrender.com
├── /                                    the app
├── /api/relay/rooms                     create + list Rooms
├── /api/relay/rooms/[roomId]/join       membership
├── /api/relay/rooms/[roomId]/messages   post + poll
├── /api/relay/blobs/…                   opaque attachment store (ADR-0009)
├── /api/health                          liveness  ← point health checks here
├── /api/tor-status                      what Tor is actually doing
└── /socket.io                           real-time push
```

Render builds from `render.yaml` → `Dockerfile.render`.

---

## Environment

| Variable | Default | Purpose |
| --- | --- | --- |
| `NODE_ENV` | `production` | Set by `render.yaml`. |
| `PORT` | `3000` | Render injects its own; the Dockerfile default is a fallback. |
| `ALLOWED_ORIGINS` | *(empty)* | Comma-separated extra socket origins. Empty means "the origin this relay is served on", which is what you want when the app and the relay are the same host. Use `*` only behind your own proxy. |
| `TOR_CONTROL_PORT` | `9051` | Tor control port, loopback inside the container. |
| `TOR_SOCKS_PORT` | `9050` | Tor SOCKS port, loopback inside the container. |
| `TOR_CONTROL_COOKIE` | `/var/lib/tor/control_auth_cookie` | Tor's cookie file. Read to authenticate to the control port. |
| `TOR_WAIT_SECONDS` | `60` | How long the entrypoint waits for Tor's control port before starting anyway. |

Render sets `RENDER_EXTERNAL_HOSTNAME` itself; the socket origin check trusts it,
so no configuration is needed for the normal single-host case.

---

## Tor

`Dockerfile.render` installs Tor and `scripts/render-start.sh` starts it, then
**waits for the control port to accept connections** before handing over to the
relay. That ordering matters: if the app answers first, its first status
responses say "no Tor" while a circuit is seconds away.

If Tor never comes up, the entrypoint logs the Tor notices and starts the relay
anyway. Tor is a capability, not a dependency — but the relay has to report its
absence rather than assume it, which is why:

- `/api/tor-status` returns `circuitEstablished: false` with a reason.
- `/api/tor-ip` returns `{ ip: null, isTor: false }` instead of inventing an exit
  address. A fabricated address is worse than an absence: it makes an unrouted
  connection look routed.
- The UI reads `useTorStatus()` and drops the Tor claim when there is no circuit.

The control port is bound to `127.0.0.1:9051` with `CookieAuthentication 1`, so
only a process that can read Tor's cookie file — which lives inside the
container — can drive it.

### What Tor on the relay does and does not cover

This is the part worth reading twice.

Tor in the container anonymises **the relay's own outbound traffic**. It does not
anonymise a browser's connection to the relay: that still travels over plain
HTTPS, protected by TLS and no more. The app says so in the Room Info panel
rather than implying otherwise, and no part of the UI claims a user's connection
is Tor-routed.

If you want client traffic routed through Tor, that has to happen at the client —
the desktop build bundles a Tor daemon and exposes `TorAPI.fetch` for it. The
relay cannot do it on a user's behalf.

---

## Verifying a deployment

```bash
npm run smoke -- https://anonchat-relay.onrender.com
```

24 checks over HTTP and Socket.IO: liveness, Tor honesty, Room lifecycle,
message posting and replay rejection, the attachment upload round-trip, the
origin policy, and a same-origin socket handshake. Non-zero exit on failure, so
it works in CI.

It exists because the bugs it catches are seam bugs — each layer correct in
isolation, wrong where they meet. Unit tests over `RelayCore` passed happily
while every attachment uploaded to an id the client never saw.

---

## Known limits

- **All relay state is in memory**, by design (ADR-0009: nothing identifying is
  persisted). A restart — including a free-tier spin-down — empties every Room,
  message and blob. `/api/health` reports `instanceId` and `startedAt` so you can
  tell a restart happened instead of wondering where your Room went.
- **One instance.** Socket.IO rooms and `RelayCore` are per-process. Scaling
  horizontally would need a shared adapter and a shared store, and would change
  the zero-knowledge story. Don't add instances casually.
- **Rate limits are per client IP** where `X-Forwarded-For` is available. Users
  behind one NAT share a bucket.
- **Blob storage is unbounded in count** (10 MiB each, 7-day TTL, swept every
  10s). A sustained flood is bounded by the per-client upload rate limit, not by
  total memory. Watch it on a busy relay.
