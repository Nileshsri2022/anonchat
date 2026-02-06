#!/bin/sh

# Start Tor in background
echo "Starting Tor on SOCKS port ${TOR_SOCKS_PORT:-9050}..."
tor -f /etc/tor/torrc &

# Wait for Tor to be ready
echo "Waiting for Tor to bootstrap..."
sleep 10

# Start Next.js app in dev mode (no build needed)
echo "Starting Next.js app in dev mode on port 3000..."
npm run dev
