# 02: Room Metadata & Canary Distribution

**What to build:**
Enable chatroom creation and join endpoints to store and distribute room security metadata, including whether a room is protected and its encrypted Room Canary payload. Joining peers receive the canary so they can perform zero-knowledge trial verification locally without transmitting passphrases to the relay server.

**Blocked by:** 01: PBKDF2 Key Derivation & Zero-Knowledge Room Canary

**Status:** done

- [x] Room creation API accepts optional `isProtected` boolean and `canary` payload
- [x] Room listing and room join endpoints return protection status and canary data to joining clients
- [x] Relay broadcasts room protection status to connected clients
- [x] Public rooms without passphrases return `isProtected: false` and no canary
