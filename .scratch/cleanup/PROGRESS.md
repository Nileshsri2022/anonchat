# Cleanup wave — progress ledger
Spec: issue #31. Tickets: #32–#42 (native blocking edges). ADRs: 0011 (design-system rebuild), 0012 (quality gates).

| # | Ticket | Issue | Status | Review | Commit |
|---|---|---|---|---|---|
| 01 | CI gates v1 | #32 | ✅ implemented | 0 hard · workflow (test/tsc/lint/build) + fresh ESLint (no-console warn w/ relay allowlist, no-explicit-any warn); one real lint error fixed (unescaped entity) | see git |
| 02 | Dead-code detector | #33 | ready | | |
| 03 | Deletion batch 1 (kit components + deps) | #34 | blocked by #32,#33 | | |
| 04 | Deletion batch 2 (feature dead + styles) | #35 | blocked by #34 | | |
| 05 | CSS nuke + token rebuild | #36 | blocked by #35 | | |
| 06 | Re-skin pass 1 (rooms/chat, mobile) | #37 | blocked by #36 | | |
| 07 | Re-skin pass 2 (DM/contacts/modals/settings) | #38 | blocked by #36 | | |
| 08 | Log & type discipline | #39 | blocked by #32 | | |
| 09 | Module consolidation | #40 | blocked by #35 | | |
| 10 | Smoke tests for consolidated modules | #41 | blocked by #40 | | |
| 11 | CI gates v2 + final verify | #42 | blocked by #34–#41 | | |

Notes: node_modules is not persisted between sessions in this sandbox — reinstall with
`npm install --ignore-scripts && node node_modules/bun/install.js` before running gates.
