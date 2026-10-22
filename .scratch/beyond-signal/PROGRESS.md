# Beyond-Signal wave — progress ledger
Spec: issue #14. Tickets: #15–#26 (native blocking edges). Process: per-ticket /implement with /tdd, /code-review per ticket, S3 golden E2E.

| # | Ticket | Issue | Status | Review | Commit |
|---|---|---|---|---|---|
| 01 | PQ hybrid handshake | #15 | ✅ implemented | Standards 0 hard · S1 3 tests + S3 2 tests; tamper/fail-closed covered |  |
| 02 | Sealed sender v3 | #16 | blocked by #15 | | |
| 03 | Sender-key lib | #17 | blocked by #15 | | |
| 04 | Room rewire | #18 | blocked by #17 | | |
| 05 | Relay blob store | #19 | ready | | |
| 06 | Attachments + voice | #20 | blocked by #16,#19 | | |
| 07 | Typing + receipts | #21 | blocked by #16 | | |
| 08 | Names + badges | #22 | blocked by #15,#18 | | |
| 09 | PWA shell | #23 | ready | | |
| 10 | Encrypted outbox | #24 | blocked by #16,#23 | | |
| 11 | Arch deepening | #25 | blocked by #18,#20 | | |
| 12 | Golden E2E | #26 | blocked by #16–#25 | | |

Suite at 01: 57 tests / 221 expects green · tsc clean · offline build green.
