# 0009. Relay Blob Store for Encrypted Attachments

## Context
Messages are capped at 64 KiB by design (Relay hardening). Attachments and voice notes need more room, and the zero-third-party invariant rules out external object storage.

## Decision
The Relay gains a blob store alongside the message buffer: clients encrypt a file client-side with a random AES-256 key, upload the opaque ciphertext to the Relay, and send the key plus blob reference inside the encrypted message. Blobs are size-capped (~10 MB), rate-limited, identifier-free, and swept on a TTL (7 days). The Relay learns nothing beyond blob size and last-touch time — the same zero-knowledge invariant as messages, extended to files.

## Considered Options
- Inline attachments in envelopes (rejected: forces raising the 64 KiB message cap for everyone, memory pressure).
- Third-party object storage (rejected: violates the zero-third-party invariant).
- Browser-to-browser WebRTC transfer (deferred: needs TURN infrastructure for NAT traversal; revisit for very large files).

## Consequences
- Attachments work on laptop and mobile PWA with no new third-party dependency.
- A blob's confidentiality and integrity live entirely in the message-carried key + AAD binding; the Relay is trusted only for availability.
- Expired blobs make old attachments honestly undownloadable — the UI says so rather than silently failing.
