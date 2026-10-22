# 03: Passphrase UI in Creation & Join Flows with Session Caching

**What to build:**
Allow users to set an optional Room Passphrase when creating a room and require entering the passphrase when joining a protected room. Provide immediate validation feedback using the Room Canary, display lock icons on protected rooms, and cache the derived key in memory for the active room session so users only enter the passphrase once.

**Blocked by:** 02: Room Metadata & Canary Distribution

**Status:** ready-for-agent

- [ ] Room creation modal includes an optional passphrase input field with show/hide visibility toggle
- [ ] Room list displays a lock icon/badge next to password-protected rooms
- [ ] Joining a protected room prompts the user with a passphrase dialog
- [ ] Entering an incorrect passphrase shows a clear error message and prevents entering the room
- [ ] Entering the correct passphrase successfully enters the room and caches the verified key for the session
- [ ] Sending and receiving messages in passworded rooms works seamlessly using the verified room key
