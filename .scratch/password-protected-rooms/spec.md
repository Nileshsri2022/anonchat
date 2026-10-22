# Spec: Password-Protected Rooms with Zero-Knowledge Canary Verification

## Problem Statement

Currently, all multi-user chatrooms in AnonChat derive their symmetric encryption keys from the room identifier and a hardcoded salt. This means anyone who learns or guesses a room identifier can eavesdrop on and decrypt all room conversations. Users who wish to establish closed, private discussion spaces cannot restrict access or encrypt their traffic with a private secret known only to authorized participants. Furthermore, traditional password authentication systems require transmitting or storing password hashes on a central server, which undermines the project's zero-knowledge privacy and anonymity guarantees over the Tor network.

## Solution

AnonChat will provide optional passphrase protection for multi-user chatrooms without leaking passphrases, hashes, or room protection status to the relay server. Room creators can optionally define a Room Passphrase when creating a room. The room's symmetric encryption key is stretched via PBKDF2 using the unique room identifier as a salt. Zero-knowledge validation is achieved using a Room Canary: an encrypted constant token stored alongside the room metadata. When joining, users enter their passphrase, and their client attempts to decrypt the canary. If AES-GCM authentication succeeds, access is granted; if it fails, the client immediately informs the user that the passphrase was incorrect. Public rooms without a passphrase continue to work seamlessly with zero friction.

## User Stories

1. As a privacy-conscious user, I want to create a room with an optional passphrase, so that only people who know the secret can decrypt and read our messages.
2. As a user creating a public room, I want to leave the passphrase blank, so that anyone with the room identifier can join without an extra password step.
3. As a room participant, I want to invite trusted contacts by sharing both the room identifier and the passphrase out-of-band, so that the relay server never learns the passphrase.
4. As a user joining a password-protected room, I want to be prompted for the passphrase before entering the chat, so that I can decrypt the incoming conversation stream.
5. As a user who enters an incorrect passphrase, I want an immediate clear error indicating the passphrase was wrong, so that I don't enter an unreadable or corrupted chat session.
6. As a user who enters the correct passphrase, I want the derived encryption key cached in memory for my session, so that I do not have to re-enter the passphrase on every message.
7. As a room member, I want my messages encrypted with a key derived from 100,000 PBKDF2 iterations, so that offline dictionary attacks against weak passphrases are computationally hardened.
8. As a user looking at the room list, I want visual locked badges distinguishing passphrase-protected rooms from public rooms, so that I understand the privacy level of each space.
9. As an eavesdropper on the relay server, I want to be prevented from discovering the passphrase or verifying guesses against a stored hash, so that the server remains strictly zero-knowledge.
10. As a user participating in a password-protected room, I want disappearing message timers to continue operating as expected, so that messages still auto-destruct after their TTL expires.
11. As an existing user with saved public rooms, I want all my existing rooms to continue functioning without requiring new passwords or data migrations, so that my existing workflow is not disrupted.

## Implementation Decisions

- **Zero-Knowledge Verification Architecture**: The relay server will not authenticate, hash, or store user passphrases. Instead, validation is performed client-side using a Room Canary. When a protected room is created, the creator encrypts `"anonchat_canary_v1"` with AES-256-GCM using the derived key and publishes the canary with the room metadata. Joining clients attempt trial decryption; valid passphrases succeed authentication tag verification, while invalid passphrases fail tag check.
- **Key Derivation Function**: Key stretching will use PBKDF2 with HMAC-SHA256, 100,000 iterations, and the room identifier as the cryptographic salt. This prevents rainbow table generation and slows brute-force search.
- **Backward Compatibility**: If a room is created without a passphrase, the room derives its key using the existing default salt, requiring no canary verification.
- **Session Key Caching**: Once verified, the derived symmetric CryptoKey is retained in the active room session state so subsequent message encryptions and decryptions incur zero key derivation overhead.
- **UI Modifications**: The room creation modal will feature an optional passphrase field with show/hide toggle. The room joining flow will inspect room metadata for a canary and display a passphrase prompt dialog when present.

## Testing Decisions

- **Behavior-Driven Testing**: Tests will verify behavior exclusively across public module interfaces without reaching into internal PBKDF2 or AES buffers.
- **Modules Under Test**: The primary module under test will be the Room Encryption service at its public interface, alongside join validation handlers.
- **Test Scenarios**:
  1. Key derivation with a passphrase successfully generates a valid canary.
  2. Trial verification with the correct passphrase returns true.
  3. Trial verification with an incorrect passphrase returns false without throwing uncaught exceptions.
  4. Public room fallback with no passphrase generates identical keys between peers.
  5. Messages encrypted by a peer with the correct passphrase cannot be decrypted by a peer with an incorrect passphrase.
- **Prior Art**: Follows the test structure established in the direct message session and room encryption test suites.

## Out of Scope

- Multi-passphrase permission tiers (e.g. read-only vs admin passphrases).
- Server-side access control lists (ACLs) or authentication endpoints.
- Asymmetric per-user key distribution for group rooms (pairwise group ratchet).

## Further Notes

- Respects ADR-0002 on zero-knowledge client canary verification.
- Integrates cleanly with existing Tor SOCKS proxy and Socket.IO room broadcasts.
