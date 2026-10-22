# Coding Standards

Documented standards and mechanical invariants for AnonChat. Enforced during code reviews.

## 1. Domain Vocabulary

Follow [`GLOSSARY.md`](GLOSSARY.md) strictly. Prohibited synonyms must never appear in UI strings, variable names, or comments:
- **Room**: Avoid *chatroom*, *group chat*, *channel*.
- **Room Passphrase**: Avoid *room password*, *channel secret*, *room PIN*.
- **Room Canary**: Avoid *password hash*, *auth token*, *room signature*, *verifier*.
- **Safety Number**: Avoid *verification code*, *security code*, *identity hash*.
- **Contact**: Avoid *friend*, *peer*, *buddy*, *user*.
- **Direct Message (DM)**: Avoid *private message*, *PM*, *1:1 room*, *secret chat*.
- **Pairwise Channel**: Avoid *DM room*, *private room*, *conversation ID*.
- **Message Envelope**: Avoid *message packet*, *payload*, *wire message*.
- **Skipped-Key Cache**: Avoid *key cache*, *backlog buffer*, *replay cache*.

## 2. Cryptographic & Runtime Conventions

1. **WebCrypto Curve Compatibility**:
   - WebCrypto in Node, Bun, and browsers only supports NIST curves (e.g. `P-256`) for `{ name: 'ECDH', namedCurve: 'P-256' }`.
   - Never use `namedCurve: 'X25519'` with `crypto.subtle` as it throws runtime errors.

2. **Bitwise Shift Unsigned Safety**:
   - In JavaScript, `(byte << 24)` evaluates to a signed 32-bit integer, yielding negative values when the high bit is 1.
   - For multi-byte numeric generation, always use `new DataView(buffer).getUint32(0)` or `>>> 0`.

3. **Pairwise Channel Delimiter**:
   - Must strictly follow [ADR-0001](docs/adr/0001-pairwise-channel-routing-for-dms.md):
     `dm_${sha256(min(pkA, pkB) + ":" + max(pkA, pkB))}` using single colon `:` as delimiter.

4. **Zero-Knowledge Relay Rule**:
   - Relay servers route opaque ciphertext only and must never store passphrases, hashes, or verifiers.
   - Client joining flows must verify the Room Canary *before* granting access. If verification fails or is aborted, clients must immediately call `relayAPI.leaveRoom` to prevent leaving phantom registrations on the relay.

## 3. React & UI Conventions

1. **Lucide React Props**:
   - In strict React/TypeScript check, SVG icon components (`LucideProps`) do not accept `title` directly.
   - Wrap icons in `<span title="...">...</span>` or `<button title="...">...</span>`.

2. **Next.js App Router Route Exports**:
   - Route files (`app/api/.../route.ts`) must only export valid Next.js HTTP method handlers (`GET`, `POST`, `PUT`, `DELETE`, etc.).
   - Helper types, constants, and utilities must be defined in `lib/` modules rather than exported from `route.ts`.
