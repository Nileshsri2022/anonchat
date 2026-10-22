# Beyond-Signal wave — progress ledger
Spec: issue #14. Tickets: #15–#26 (native blocking edges). Process: per-ticket /implement with /tdd, /code-review per ticket, S3 golden E2E.

| # | Ticket | Issue | Status | Review | Commit |
|---|---|---|---|---|---|
| 01 | PQ hybrid handshake | #15 | ✅ implemented | 0 hard · 2 review findings fixed (use-time PQ sig verify; unsigned key fail-closed) | e342af0+ac48fed+9d10888 |
| 02 | Sealed sender v3 | #16 | ✅ implemented | 0 hard · sealed handshake refined in ADR-0007 (DH1 replaced by in-ciphertext signature); 4 dedicated tests | see git |
| 03 | Sender-key lib | #17 | ✅ implemented | 0 hard · chain ratchet + skip cache + rotation + pairwise distribution proven over live v3 DM | see git |
| 04 | Room rewire | #18 | ✅ implemented (part 1 core + part 2 UI) | 0 hard · S3 whole story; intros carry full bundles; hook + badge wired; passphrase rooms unchanged | see git |
| 05 | Relay blob store | #19 | ✅ implemented | 0 hard · result-pattern matched postMessage contract; 6 S2 tests (round-trip, 413, 429, TTL, 404, no-metadata) | see git |
| 06 | Attachments + voice | #20 | blocked by #16,#19 | | |
| 07 | Typing + receipts | #21 | blocked by #16 | | |
| 08 | Names + badges | #22 | blocked by #15,#18 | | |
| 09 | PWA shell | #23 | ✅ implemented | 0 hard · manifest sanity + SW network-only-API asserted by test; badge lifecycle test | see git |
| 10 | Encrypted outbox | #24 | blocked by #16,#23 | | |
| 11 | Arch deepening | #25 | blocked by #18,#20 | | |
| 12 | Golden E2E | #26 | blocked by #16–#25 | | |

Suite at 01: 57 tests / 221 expects green · tsc clean · offline build green.
