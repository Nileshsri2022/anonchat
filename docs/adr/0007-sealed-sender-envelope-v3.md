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
