# Hardening build — progress ledger

Tracker: spec #2, tickets #3–#12 (sub-issues, native blocking edges).
NOTE: the GitHub token can create issues/labels/edges but cannot comment/close/edit,
so per-ticket status lives here until it can be mirrored into the final PR.

| Ticket | Issue | Status | Review | Commit |
|---|---|---|---|---|
| 01 Identity Vault | #3 | ✅ implemented | Standards 0 hard/2 judgement · Spec 5/5 | 139e1b7 |
| 02 Contact exchange | #4 | ✅ implemented | Standards 0 hard · Spec 4/4 ACs | 93e4f3e |
| 03 DM protocol core | #5 | ✅ implemented | Standards 0 hard/2 judgement (base64 helpers dup → #11) · Spec 7/7 ACs | de633ff |
| 04 DMs live | #6 | ✅ implemented | Standards 0 hard · Spec 4/4 ACs (+2 integration bugs found & fixed) | 1956913 |
| 05 Room Keys + Invites | #7 | ✅ implemented | Standards 0 hard · Spec 5/5 ACs | see git |
| 06 Encrypted history | #8 | ✅ implemented | Standards 0 hard · Spec 4/4 ACs | 174233f |
| 07 Relay hardening | #9 | ✅ implemented | Standards 0 hard · Spec 8/8 ACs | see git |
| 08 Privacy/build | #10 | ✅ implemented | offline build green, headers added | see git |
| 09 Verification UX + consolidation | #11 | ✅ implemented | Standards 0 hard · Spec 5/5 ACs (SAS = key-derived, timing-safe verify; 6 dead modules deleted) | eef3a91 |
| 10 Full-flow E2E | #12 | ✅ implemented | S3 golden seam green: 3 stacks / 1 relay, whole story in 1 test (20 asserts); dup delivery + self-echo made idempotent; broken dead kdfChain removed (finding 4 closed) | 970f2e0 |

Test seams (agreed): S1 lib module interfaces · S2 relay HTTP · S3 two-client E2E.


## WAVE COMPLETE (2026-10-22)
All 10 tickets (#3–#12) shipped via PR #13. Spec issue #2 closed out by the wave-completion commit on master (the Arena token cannot close/comment on issues).
