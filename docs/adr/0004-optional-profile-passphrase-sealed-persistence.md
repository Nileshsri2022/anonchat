# 0004. Local Persistence Sealed by an Optional Profile Passphrase

## Context
Messages, identity keys, Contact records, and Ratchet State are persisted locally. Storing them in plaintext means disk access (lost laptop, shared machine, malware with file read) exposes the entire history and the identity's private keys. Mandatory passphrases, however, add first-launch friction that anonymous, no-account users will bounce off.

## Decision
All local persistence (message history, Identity Keys, Pre-Keys, Ratchet State, Contacts) is sealed with AES-256-GCM under a key derived from an optional Profile Passphrase (PBKDF2-SHA-256, high iteration count, random salt, stored next to the ciphertext). When no Profile Passphrase is set, data is stored device-local without encryption and Settings shows a visible caveat. Setting or changing the passphrase re-seals the vault; the passphrase itself never leaves the device.

## Considered Options
- Mandatory passphrase (rejected: churn risk for an anonymous, zero-signup app; chosen as an option instead).
- Random device key in localStorage (rejected: protects nothing beyond casual file reads — the key sits beside the data).
- OS keychain via Electron safeStorage as the only mechanism (kept as a possible future enhancement; browser builds need a portable answer).

## Consequences
- The Profile Passphrase cannot be recovered; forgetting it permanently loses local history and identity (documented in the lock UI).
- Unlock is required once per app launch when a passphrase is set.
- Tests treat "sealed vs unsealed" as a first-class state of any storage component.
