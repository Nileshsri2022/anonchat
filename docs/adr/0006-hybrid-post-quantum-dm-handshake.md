# 0006. Hybrid Post-Quantum DM Handshake (ML-KEM + X25519)

## Context
DM sessions open with X3DH over ECDH P-256. A future quantum adversary who records today's handshake traffic can later recover the shared secrets ("harvest now, decrypt later"). Classical ECDH alone no longer meets the project's security bar.

## Decision
The DM handshake becomes a hybrid, Signal-PQXDH-style construction: the Initiator performs both the classical ECDH set and an ML-KEM-768 encapsulation against the Responder's published PQ KEM key. Both secrets feed one HKDF root-key derivation with the existing wire-context domain separation. The Identity Bundle grows a signed ML-KEM public key (Bundle v2, signature verified like the Pre-Key signature). Without the PQ share the root key is not derived — the hybrid is mandatory, not opportunistic.

## Considered Options
- Keep classical-only X3DH (rejected: harvest-now-decrypt-later risk).
- Pure PQ (rejected: PQ-only crypto is younger; hybrid keeps classical safety while adding PQ).
- TLS-level PQ (rejected: hop-by-hop; E2E must be quantum-safe).

## Consequences
- Identity Vault gains an ML-KEM keypair; Bundle v2 carries it (larger Invites).
- All peers must upgrade before PQ-protected sessions can open; responders without Bundle v2 stay on the classical-only path until migrated (expand–contract).
- Message sizes grow by the ML-KEM ciphertext (~1 KiB) on session setup only; per-message cost unchanged.
