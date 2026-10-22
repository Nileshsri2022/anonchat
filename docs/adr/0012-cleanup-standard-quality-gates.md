# 0012. Cleanup Standard — Automated Quality Gates in CI

## Context
Two waves of feature work landed with zero enforcement keeping the codebase clean: a full shadcn kit, four transitively-dead dependencies, 99 console.logs, unconfigured ESLint, no CI beyond a release build — and a bare `public` ignore line that silently dropped shipped files until a fresh checkout exposed it. One-time manual cleanups drift.

## Decision
Cleanup is enforced by CI gates, not memory: a GitHub Actions workflow runs on every PR — bun test, tsc --noEmit, next build (offline), ESLint (freshly configured, `no-console` with a relay-log allowlist, no-explicit-any), and a knip-style dead-code detector that fails on unused files, dependencies, and exports. The dead-code gate lands last, once the backlog it would flag is actually deleted. Module structure follows the consolidation policy: `*-instance` singleton wrappers merge into their owning modules or one instances module; the transport seam owns the network surface.

## Considered Options
- Manual passes only (rejected: proven to drift — the public/ incident).
- SonarQube-style external analysis (rejected: heavy; knip + ESLint cover the actual failure modes at near-zero cost).

## Consequences
- Every PR is mechanically protected against dead weight, noise logs, and type erosion.
- New primitives/components are added only when a live surface needs them, or the detector fails.
