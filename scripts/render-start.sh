#!/usr/bin/env bash
# Container entrypoint for the AnonChat relay.
#
# Tor must be up before the relay starts answering, because the relay reports on
# Tor: if the app comes up first, the first status requests answer "no Tor" and
# the UI tells users they are unrouted when a circuit is ten seconds away.
#
# Tor's absence is never fatal. The relay is useful without it — it just has to
# say so. So every failure here logs loudly and continues.
set -uo pipefail

CONTROL_HOST="${TOR_CONTROL_HOST:-127.0.0.1}"
CONTROL_PORT="${TOR_CONTROL_PORT:-9051}"
SOCKS_PORT="${TOR_SOCKS_PORT:-9050}"
TOR_WAIT_SECONDS="${TOR_WAIT_SECONDS:-60}"

log() { echo "[entrypoint] $*"; }

port_open() {
  # bash's /dev/tcp keeps this dependency-free: no nc, no curl, no python.
  (exec 3<>"/dev/tcp/${CONTROL_HOST}/${CONTROL_PORT}") >/dev/null 2>&1
}

start_tor() {
  if ! command -v tor >/dev/null 2>&1; then
    log "Tor is NOT INSTALLED in this image - starting without it."
    log "The relay will run, and will honestly report that it is not routing."
    log "If this service is on a native runtime (Node), it has no Tor: Render"
    log "cannot switch an existing service to Docker from the dashboard."
    return 1
  fi

  # A PaaS egress firewall may block the non-web ports Tor normally uses for
  # relays (9001, 9030). FascistFirewall restricts Tor to relays listening on 80
  # and 443, which almost nothing blocks. It shrinks the guard pool, so it is
  # opt-in - but reachable from the dashboard, without a rebuild.
  if [ "${TOR_FASCIST_FIREWALL:-0}" = "1" ]; then
    if ( printf '%s\n' 'FascistFirewall 1' >> /etc/tor/torrc ) 2>/dev/null; then
      log "TOR_FASCIST_FIREWALL=1 — restricted Tor to relays on ports 80 and 443."
    else
      log "TOR_FASCIST_FIREWALL=1 was set but /etc/tor/torrc is not writable here; ignoring."
    fi
  fi

  log "Starting Tor daemon (control ${CONTROL_HOST}:${CONTROL_PORT}, socks ${CONTROL_HOST}:${SOCKS_PORT})"
  tor -f /etc/tor/torrc &
  TOR_PID=$!
  log "Tor spawned with PID ${TOR_PID}"

  local waited=0
  while [ "${waited}" -lt "${TOR_WAIT_SECONDS}" ]; do
    if port_open; then
      log "Tor control port is accepting connections after ${waited}s."
      return 0
    fi
    if ! kill -0 "${TOR_PID}" 2>/dev/null; then
      log "Tor exited during startup (PID ${TOR_PID}). Notices follow:"
      cat /var/log/tor/notices.log 2>/dev/null || log "(no Tor log available)"
      return 1
    fi
    sleep 1
    waited=$((waited + 1))
  done

  log "Tor did not open its control port within ${TOR_WAIT_SECONDS}s. Continuing without it."
  cat /var/log/tor/notices.log 2>/dev/null || log "(no Tor log available)"
  return 1
}

start_tor || log "Running WITHOUT Tor. /api/tor-status and /api/health will report it."

log "Binding to ${HOSTNAME:-0.0.0.0}:${PORT:-3000}"
exec bun run start
