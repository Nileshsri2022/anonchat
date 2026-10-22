# 0011. Design System Rebuilt In-House on Tailwind v4

## Context
The UI carries two full stylesheets (88 live token lines in app/globals.css powering 49 files; a dead 125-line duplicate in styles/globals.css) and a complete 76-file shadcn/ui kit install, most of which is never imported — classic v0.app output. The product decision (cleanup wave, 2026-10-22) is to nuke and rebuild rather than audit-preserve.

## Decision
Both stylesheets are deleted and the design system is rebuilt from scratch on Tailwind v4: one fresh tokens file (palette, light+dark, mobile spacing scale) and a minimal set of primitives covering only the live surface (rooms/chat, DM, contacts, modals, settings). All unused kit components and their transitive dependencies are deleted (provably-dead-only rule). The app may look broken between the nuke and the re-skin tickets; build and tests must stay green throughout — visual churn is accepted, functional churn is not.

## Considered Options
- Audit-preserve (rejected per product decision: the kit is the bloat, not the fix).
- Switch styling systems (rejected: Tailwind v4 is already the engine and works; the bloat is upstream of it).

## Consequences
- The design system becomes ~1 tokens file + <10 primitives instead of 76 components + 2 stylesheets.
- Re-skin tickets must visually verify every live surface in the preview before closing.
- Future UI work adds primitives only when a live surface needs them.
