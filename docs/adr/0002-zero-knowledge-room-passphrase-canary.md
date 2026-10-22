# 0002. Zero-Knowledge Room Passphrase Verification via Canary

## Context
Multi-user Rooms need optional password protection without allowing the relay server to observe, store, or verify passphrases. Storing password hashes on the relay creates a target for dictionary attacks and reveals which rooms are protected.

## Decision
We validate Room Passphrases entirely client-side using a Room Canary:
1. Room keys are derived using PBKDF2-HMAC-SHA256 (100,000 iterations) with `roomId` as the salt and the user's passphrase.
2. When a passworded room is created, the creator encrypts a constant string (`"anonchat_canary_v1"`) with AES-256-GCM and stores the ciphertext with the room's metadata.
3. Joining clients derive the key from their entered passphrase and attempt to decrypt the canary. If AES-GCM authentication succeeds, the passphrase is valid; if tag verification fails, the passphrase is wrong.

## Consequences
- The relay server remains completely zero-knowledge, never holding user passphrases or verifier hashes.
- PBKDF2 key stretching protects weak user passphrases from instant offline brute force.
- Unprotected public rooms simply use the default salt and require no canary check.
