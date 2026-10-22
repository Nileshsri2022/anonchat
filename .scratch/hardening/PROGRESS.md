# Hardening build — progress ledger

Tracker: spec #2, tickets #3–#12 (sub-issues, native blocking edges).
NOTE: the GitHub token can create issues/labels/edges but cannot comment/close/edit,
so per-ticket status lives here until it can be mirrored into the final PR.

| Ticket | Issue | Status | Review | Commit |
|---|---|---|---|---|
| 01 Identity Vault | #3 | ✅ implemented | Standards 0 hard/2 judgement · Spec 5/5 | 139e1b7 |
| 02 Contact exchange | #4 | in progress | | |
| 03 DM protocol core | #5 | ✅ implemented | Standards 0 hard/2 judgement (base64 helpers dup → #11) · Spec 7/7 ACs | de633ff |
| 04 DMs live | #6 | blocked by #4 | | |
| 05 Room Keys + Invites | #7 | blocked by #4 | | |
| 06 Encrypted history | #8 | blocked by #3 (now unblocked) | | |
| 07 Relay hardening | #9 | pending | | |
| 08 Privacy/build | #10 | pending | | |
| 09 Verification UX + consolidation | #11 | blocked by #4 | | |
| 10 Full-flow E2E | #12 | blocked by #3–#11 | | |

Test seams (agreed): S1 lib module interfaces · S2 relay HTTP · S3 two-client E2E.
