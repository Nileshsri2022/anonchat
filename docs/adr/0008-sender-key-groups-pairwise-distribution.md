# 0008. Sender-Key Groups; Pairwise Distribution; Room-Key Intro

## Context
A Room's single shared Room Key gives every member the same symmetric key: one compromised member (or Invite leak) exposes all history and lets anyone forge any member. Groups need per-sender forward secrecy and authentication while keeping the Invite-only join.

## Decision
Each member maintains a Sender Key per Room and ratchets it per message (chain keys, out-of-order cache, per-sender authentication). Sender Keys are distributed strictly pairwise: each member encrypts their Sender Key to every other member over their pairwise DM ratchet. To make that possible without QR exchanges between all members, joining with an Invite admits a member to post ONE Intro Message — Identity Bundle + chosen Display Name, encrypted to the Room Key — from which other members establish the pairwise DM channels. The Room Key therefore protects exactly one announcement per member and never a Sender Key. Members display an Unverified Badge until their SAS has been verified through the existing pairwise verification flow.

## Considered Options
- Room-key bootstrapped Sender Keys (rejected per product decision: the Room Key would introduce every Sender Key, widening what an Invite leak compromises).
- Full MLS (deferred: heavy dependency; this design achieves the same guarantees that matter at Room scale).
- Shared Room Key (rejected: single point of failure — the status quo this replaces).

## Consequences
- New members see no history: Sender Chains they hold start at their join (a feature, not a gap).
- A leaked Invite exposes only Intro Messages (bundle + name), not message history.
- Member leave is announced pairwise; on announcement, remaining members rotate their Sender Keys.
- Rooms now require DM capability between members; the Room UI degrades honestly if pairwise setup is incomplete.
