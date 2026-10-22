# 0007. Sealed Sender — Envelope v3 Carries No Sender Identity

## Context
Envelopes v2 carry `senderId` and `senderIdentityPublic` in the cleartext wire header, so the Relay can build a who→whom graph despite never seeing plaintext. The Relay needs only an opaque destination to deliver; sender identity on the wire is metadata it does not need.

## Decision
Envelope v3 strips all sender identity from the wire: the transport frame is `channelId + ciphertext + ratchet header`. The recipient authenticates the sender inside the protocol — the ratchet root key is already bound to both parties' identity keys, so a sender who cannot derive message keys cannot forge, and DM routing targets the recipient's deterministic inbox Room derived from the recipient's identity key alone. Sender identity, where the UI needs it, is recovered from the decrypted payload after authentication.

## Considered Options
- Pseudonymous sender aliases on the wire (rejected: still a per-sender linkage the Relay can correlate).
- Keep v2 headers (rejected: the graph is exactly what sealed sender exists to destroy).

## Consequences
- The Relay can no longer correlate sender to recipient beyond observing traffic at delivery time.
- Recipient-side handling must treat "who sent this" as a decryption output, not a routing input.
- Replay detection stays with the existing consumed-key guard inside the session (unchanged).

## Amendment (implemented, ticket #16): the sealed handshake

Dropping the sender identity from the wire breaks X3DH's DH1 term (DH(IK_sender, SPK_recipient)), which required the sender's identity key before decryption. Envelope v3 therefore uses a refined handshake:

- The root derives from DH2 (EK×IK_recipient) + DH3 (EK×SPK_recipient) + the PQ share (ADR-0006) — no DH1.
- The initiator signs its ephemeral public key with its identity Signing Key and rides `{identity key, signing key, signature}` INSIDE the encrypted first payload (message n=0). The recipient derives the root, decrypts, verifies the signature against the ephemeral on the wire, and only then learns who sent it — authenticated, not routing-visible.
- The v3 wire-context AAD binds channel + recipient identity only (`anonchat-dm-v3`); the sender is inside the seal.
- Message n=0 MUST carry the identity block; a message-0 without it is refused (fail closed). Out-of-order later messages attribute once n=0 lands via the skipped-key cache.
- The identity↔signing-key binding remains trust-on-first-use: the signature authenticates the session's key continuity from message one; the binding itself is confirmed by the existing SAS verification flow (ticket 09, hardening wave).
- Self-echo (catch-up polling returning one's own envelopes) is detected by a bounded local set of recently sent (channel, iv, ciphertext) triples — no wire marker needed.
- v2 envelopes (identity on the wire) remain accepted during migration.
