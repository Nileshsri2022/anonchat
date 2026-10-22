# Beyond-Signal wave — progress ledger
Spec: issue #14. Tickets: #15–#26 (native blocking edges). Process: per-ticket /implement with /tdd, /code-review per ticket, S3 golden E2E.

| # | Ticket | Issue | Status | Review | Commit |
|---|---|---|---|---|---|
| 01 | PQ hybrid handshake | #15 | ✅ implemented | 0 hard · 2 review findings fixed (use-time PQ sig verify; unsigned key fail-closed) | e342af0+ac48fed+9d10888 |
| 02 | Sealed sender v3 | #16 | ✅ implemented | 0 hard · sealed handshake refined in ADR-0007 (DH1 replaced by in-ciphertext signature); 4 dedicated tests | cc77c69 |
| 03 | Sender-key lib | #17 | ✅ implemented | 0 hard · chain ratchet + skip cache + rotation + pairwise distribution proven over live v3 DM | 6d45a0c |
| 04 | Room rewire | #18 | ✅ implemented (part 1 core + part 2 UI) | 0 hard · S3 whole story; intros carry full bundles; hook + badge wired; passphrase rooms unchanged | dabef10 + 10ba518 |
| 05 | Relay blob store | #19 | ✅ implemented | 0 hard · result-pattern matched postMessage contract; 6 S2 tests (round-trip, 413, 429, TTL, 404, no-metadata) | bb0f3ef |
| 06 | Attachments + voice | #20 | ✅ implemented | 0 hard · AAD binds blobId+name+mime (swap attack fails); reserve-then-upload flow; DM UI: attach, MediaRecorder voice, thumbnails, honest expiry | 911f182 |
| 07 | Typing + receipts | #21 | ✅ implemented | 0 hard · controls ride the sealed channel; receipts OFF by default + per-contact opt-in (zero leaks when off); typing throttled 2.5s | c34013a |
| 08 | Names + badges | #22 | ✅ implemented | 0 hard · name INSIDE the PQ-signed material (tamper → reject); sanity limits; profile editor; intro + invite propagation | a98d193 |
| 09 | PWA shell | #23 | ✅ implemented | 0 hard · manifest sanity + SW network-only-API asserted by test; badge lifecycle test | 8cd43b1 |
| 10 | Encrypted outbox | #24 | ✅ implemented | 0 hard · sealed queue (same key scheme as history); flush+retry, in-order; FIXED failed-first-send killing a session (PQ ct lost) | 9c9e400 |
| 11 | Arch deepening | #25 | ✅ implemented | 0 hard · TransportAdapter seam (2 adapters, tested once vs RelayCore); redis/better-sqlite3/keytar removed; Tor behind a narrow bridge interface | e82779b |
| 12 | Golden E2E | #26 | ✅ implemented | 41 asserts, one test: PQ→sealed→intro room→blob→outbox→purge→sealed reload; relay audited blind at the end; FIXED name-aware PQ verify at use | 822f15f |

Final: 89 tests / 423 expects green · tsc clean · offline build green. All 12 tickets (#15–#26) closed.


## WAVE COMPLETE (2026-10-22)
All 12 tickets (#15–#26) shipped via PR #27. Spec issue #14 closed out by the wave-completion commit on master (the Arena token cannot close/comment on issues).
