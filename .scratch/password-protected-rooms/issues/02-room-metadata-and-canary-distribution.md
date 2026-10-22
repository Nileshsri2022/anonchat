# 02: Room Metadata & Canary Distribution

**What to build:**
Enable chatroom creation and join endpoints to store and distribute room security metadata, including whether a room is protected and its encrypted Room Canary payload. Joining peers receive the canary so they can perform zero-knowledge trial verification locally without transmitting passphrases to the relay server.

**Blocked by:** 01: PBKDF2 Key Derivation & Zero-Knowledge Room Canary

**Status:** ready-for-agent

- [ ] Room creation API accepts optional `isProtected` boolean and `canary` payload
- [ ] Room listing and room join endpoints return protection status and canary data to joining clients
- [ ] Relay broadcasts room protection status to connected clients
- [ ] Public rooms without passphrases return `isProtected: false` and no canary
