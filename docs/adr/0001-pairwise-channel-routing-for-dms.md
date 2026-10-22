# 0001. Pairwise Channel Routing for Direct Messages

## Context
Direct messages between two contacts require real-time transport over our Socket.IO relay without exposing the sender or recipient identities, relationship graphs, or IP addresses to the relay server.

## Decision
We derive a deterministic Pairwise Channel identifier by sorting and hashing the two contacts' identity public keys (`dm_${sha256(min(pkA, pkB) + ":" + max(pkA, pkB))}`). Both peers join this channel on the relay server.

## Consequences
- The relay server cannot determine who the participants are, only that an opaque room is exchanging encrypted message envelopes.
- No new centralized mailbox or inbox architecture is needed; DMs reuse the existing room socket infrastructure.
- Both participants must establish presence on the pairwise channel to receive real-time updates.
