# 0010. PWA Client Shell with Encrypted Outbox

## Context
The app must be easy to use on mobile. Native rewrites fork the codebase; store wrappers add review gates. The existing browser-first deployment (two tabs = two users, preview demoable) is a standing product decision.

## Decision
The client becomes an installable PWA: a web manifest and service worker cache the application shell (instant load, home-screen install, resilient on flaky networks), with a responsive mobile pass on the chat surfaces. Messages composed while offline are held in an encrypted Outbox (sealed with the existing Profile Passphrase storage scheme) and flushed automatically on reconnect; each message shows send/pending/failed state. In-app notifications only this round (tab title, toast, unread badges) — Web Push is deferred. Electron remains the desktop shell over the same codebase.

## Considered Options
- Capacitor store wrapper (deferred: store review for an E2EE messenger; revisit if distribution demands).
- React Native rewrite (rejected: forks the codebase, years-scale).
- Full background sync (deferred: unreliable on iOS PWAs; the Outbox already covers the need).

## Consequences
- One codebase serves browser, installed PWA, and Electron desktop.
- The Relay and API surface is untouched by the shell work (network continues to work when the shell is cached; API calls stay network-only).
- Offline behaviour is explicit per message (pending/failed), never silently dropped.
