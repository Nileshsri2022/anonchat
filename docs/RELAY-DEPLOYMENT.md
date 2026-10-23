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

Render runs this on its **native Node/Bun runtime**, not Docker. `render.yaml`
declares that; `Dockerfile.render` is an optional second path, described at the
bottom of this document.

```text
build:  bun install --frozen-lockfile && bun run build
start:  bun run start        # -> server.js
```

`bun.lock` is in the repo, which is what makes Bun available on Render's native
runtime — Render includes it automatically when it sees that lockfile.
`BUN_VERSION` is pinned so deploys don't drift with Render's default.

---

## Environment

| Variable | Default | Purpose |
| --- | --- | --- |
| `NODE_ENV` | `production` | Set by `render.yaml`. |
| `PORT` | Render injects it | The relay binds to whatever Render provides. Don't set it by hand. |
| `BUN_VERSION` | `1.4.3` | Pinned so deploys don't drift with Render's default. |
| `ELECTRON_SKIP_BINARY_DOWNLOAD` | `1` | Skips the ~100MB Electron download during install. Without it, a failed download fails the build. |
| `ALLOWED_ORIGINS` | *(empty)* | Comma-separated extra socket origins. Empty means "the origin this relay is served on", which is what you want when the app and the relay are the same host. Use `*` only behind your own proxy. |

Render sets `RENDER_EXTERNAL_HOSTNAME` itself; the socket origin check trusts it,
so no configuration is needed for the normal single-host case.

These only apply on the Docker path, where a Tor daemon exists:

| Variable | Default | Purpose |
| --- | --- | --- |
| `TOR_CONTROL_PORT` | `9051` | Tor control port, loopback inside the container. |
| `TOR_SOCKS_PORT` | `9050` | Tor SOCKS port, loopback inside the container. |
| `TOR_CONTROL_COOKIE` | `/var/lib/tor/control_auth_cookie` | Tor's cookie file. Read to authenticate to the control port. |
| `TOR_WAIT_SECONDS` | `60` | How long the entrypoint waits for Tor's control port before starting anyway. |
| `TOR_FASCIST_FIREWALL` | `0` | Set to `1` if Tor starts but never bootstraps: forces Tor onto relays listening on 80/443. |

---

## Tor

**On the native Node runtime there is no Tor, and that is currently fine.** Tor
is installed by `apt` inside `Dockerfile.render`, so a Node deployment never has
it. Read the next section before deciding that is a problem.

When the image *does* have Tor, `scripts/render-start.sh` starts it and **waits
for the control port to accept connections** before handing over to the relay.
That ordering matters: if the app answers first, its first status responses say
"no Tor" while a circuit is seconds away.

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

### Do you actually need Tor on the relay?

Probably not, and it is worth being blunt about why.

The relay makes **no outbound network requests**. Not one. Every `fetch` in
`lib/relay-api.ts` and `lib/blob-client.ts` uses a relative URL, which the
browser resolves against the relay's own origin — those are inbound requests
from the client, not calls the relay makes. The single method that looks like an
outbound call, `TorIntegration.fetchThroughTor`, has no callers, and its body
calls plain `fetch(url, options)` without ever attaching the SOCKS agent.

So a Tor daemon on this relay would have nothing to route. It would exist so the
UI could display a green shield. That is the exact failure mode the rest of this
document is written to prevent: reporting anonymity we do not have.

Tor earns its place where the traffic actually is:

- **The desktop client**, which bundles its own Tor daemon and exposes
  `window.TorAPI.fetch`. Wiring `relayAPI` through that is the change that would
  make "routed through Tor" true for real messages.
- **A relay that makes outbound calls** — federation, push, anything server-side.

If you want either, that is a build, not a config toggle.

### Getting Tor working (Docker path only)

Tor has to clear four hurdles. Each one fails differently, and the entrypoint
tells you which one it was — so read the log before changing anything.

```text
1. the tor binary is in the image          -> "Tor is NOT INSTALLED in this image"
2. the daemon starts as a non-root user    -> "Tor exited during startup"
3. the control port opens                  -> "did not open its control port within Ns"
4. Tor bootstraps to 100% and builds       -> /api/tor-status says bootstrapping %
   a three-hop circuit
```

**Run this first.** It names the hurdle:

```bash
curl -s https://anonchat-relay.onrender.com/api/health | jq '.tor'
curl -s https://anonchat-relay.onrender.com/api/tor-status | jq '.'
```

Then read the `[entrypoint]` lines in the Render deploy log. You are in exactly
one of these four situations:

| What the log says | What it means | What to do |
| --- | --- | --- |
| `Tor is NOT INSTALLED in this image` | The service is not running the Docker image, so `apt install tor` never happened. | See *Switching the runtime*, below. |
| `Tor exited during startup` | Tor found its config but died. The notices are printed right after this line. | Read `/var/log/tor/notices.log` (Render Shell). Usually `DataDirectory` permissions. |
| `did not open its control port within 60s` | Tor is running but stuck. Almost always bootstrap, not the port. | Raise `TOR_WAIT_SECONDS`, then check `bootstrapProgress`. |
| `Tor control port is accepting connections after Ns` | Working. | Confirm with `/api/tor-status`: you want `circuitEstablished: true`. |

**If Tor starts but bootstrap stalls below 100%**, the platform's egress is
probably blocking the non-web ports Tor uses to reach relays (9001, 9030). Set
`TOR_FASCIST_FIREWALL=1` on the service and redeploy: Tor then only connects to
relays listening on 80 and 443, which almost nothing blocks. The trade-off is a
much smaller guard pool, so turn it back off if you find egress was fine.

This is a dashboard env var, not a code change — that is deliberate. The
alternative is a full Docker rebuild per attempt, which costs minutes each.

#### Switching the runtime

If `tor` is not installed, the service is on Render's native Node runtime. It
will never have Tor, because the daemon comes from `apt` in the image.

Render **cannot switch an existing service's runtime from the dashboard** —
[only via the API or a Blueprint](https://render.com/changelog/change-an-existing-services-runtime-via-api-or-blueprint).
Two options:

1. **Blueprint (keeps this repo as the source of truth).** `render.yaml` already
   declares `runtime: docker`. Create a Blueprint from it and point it at the
   service, or let it create a new one.
2. **API.** PATCH the service with `serviceDetails.runtime = "docker"`, then
   trigger a deploy. Check the service's current runtime under
   **Settings → Build** first — it may already say Docker, in which case Tor is
   installed and you are on a different row of the table above.

Either way, note that a *new* service gets a *new* `onrender.com` hostname. Any
bookmarks, QR Invites in the wild, or `ALLOWED_ORIGINS` entries that name the old
host will need updating.

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

---

## The Docker path (optional)

`Dockerfile.render` is kept for anyone who wants a Tor daemon in the container,
or full control over the image. It is **not** how the relay is deployed today.

To use it, change `runtime: node` to `runtime: docker` in `render.yaml` and add:

```yaml
    dockerfilePath: ./Dockerfile.render
```

You cannot do that from the Render dashboard — [an existing service's runtime is
only changeable via the API or a blueprint](https://render.com/changelog/change-an-existing-services-runtime-via-api-or-blueprint).

What you gain: `apt install tor`, a loopback control port with cookie
authentication, and an entrypoint that waits for it.

What you give up: Docker builds are slower than native ones, and you take on the
image. Note that `HEALTHCHECK` in the Dockerfile is advisory — Render runs its
own check against `healthCheckPath`.

And what you do **not** gain, per the section above: anonymised user traffic.
