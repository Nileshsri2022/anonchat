# 0005. DM Handshake: Initiator Acts on an Identity Bundle; Responder Completes X3DH on First Envelope

## Context
Two peers discover each other out-of-band (QR / Invite), not through a pre-key server. Earlier code had both peers run the initiator role against each other's Contact record, which derived different shared secrets on each side — unit tests passed because they constructed the roles manually, but two real clients could never agree on a key. There is no server-side pre-key distribution, so asynchronous first contact must work from a single out-of-band exchange.

## Decision
A Contact's Identity Bundle (identity public key, signed Pre-Key + its signature, Pre-Key id) is all the initiator needs. The initiator verifies the Pre-Key signature against the identity key, performs X3DH (identity×pre-key, ephemeral×identity, ephemeral×pre-key), and sends the first Message Envelope carrying its ephemeral DH public and identity public key in the header. The Responder completes X3DH on receipt of that first envelope using its own Pre-Key private half, then both sides run the Double Ratchet (HKDF-based chain and root keys, bounded Skipped-Key Cache, per-message numbers in the header). One one-directional scan therefore suffices for a fully bidirectional, asynchronous session.

## Considered Options
- Both peers initiate symmetrically (rejected: produces divergent shared secrets; the bug being fixed).
- A pre-key server for asynchronous bundles (rejected: adds server-side identity infrastructure and metadata; the Identity Bundle in the Invite already covers async first contact).

## Consequences
- The Identity Bundle must travel with the QR/Invite — fake or random key material breaks the handshake silently, so bundle fields are validated on import.
- Compromise of a Pre-Key private before first use exposes pre-ratchet messages for that peer only, bounded by the ratchet; Pre-Keys are rotated on use.
