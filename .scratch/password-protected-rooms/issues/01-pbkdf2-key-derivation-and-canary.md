# 01: PBKDF2 Key Derivation & Zero-Knowledge Room Canary

**What to build:** 
Enable users to stretch room passphrases into 256-bit AES-GCM symmetric encryption keys using PBKDF2-HMAC-SHA256 with 100,000 iterations and the unique room ID as salt. Provide zero-knowledge passphrase validation by creating an encrypted Room Canary token (`"anonchat_canary_v1"`), and verifying trial passphrases client-side against the canary via AES-GCM tag authentication. Maintain seamless fallback for unprotected public rooms without passphrases.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] `RoomEncryption` derives a 256-bit AES-GCM key from a room passphrase and room identifier using PBKDF2 (100k iterations, SHA-256)
- [x] Omitting the passphrase falls back to the default public room salt (`'shared-secret'`)
- [x] `createCanary()` produces an AES-GCM encrypted canary ciphertext
- [x] `verifyCanary(canary)` decrypts the canary and returns `true` for a correct passphrase
- [x] `verifyCanary(canary)` returns `false` without throwing an unhandled exception when an incorrect passphrase is used
- [x] Full automated test suite verifying symmetry, tamper resistance, and public room fallback
