# AnonChat

Anonymous, end-to-end encrypted messaging application over the Tor network.

## Language

**Contact**:
A remote peer whose cryptographic identity bundle and pre-keys have been imported and verified out-of-band.
_Avoid_: Friend, peer, buddy, user

**Direct Message (DM)**:
A pairwise, end-to-end encrypted conversation session between two Contacts using the Double Ratchet protocol.
_Avoid_: Private message, PM, 1:1 room, secret chat

**Message Envelope**:
The serialised transport structure containing a Double Ratchet header (ephemeral DH public key, sequence numbers) and encrypted payload.
_Avoid_: Message packet, payload, wire message

**Pairwise Channel**:
A deterministic relay identifier derived from hashing two sorted Contact public keys, enabling anonymous rendezvous without metadata leakage.
_Avoid_: DM room, private room, conversation ID

**Ratchet State**:
The client-side cryptographic state of an active Double Ratchet session (root key, chain keys, and DH keypairs) persisted in IndexedDB.
_Avoid_: Session token, session data, chat state

**Room**:
A multi-user conversation space secured by a symmetric encryption key derived from the room identifier.
_Avoid_: Channel, group chat, chatroom

**Safety Number**:
The verifiable cryptographic fingerprint derived from both peers' identity public keys, compared out-of-band to detect man-in-the-middle attacks.
_Avoid_: Verification code, security code, identity hash

**Skipped-Key Cache**:
A bounded in-memory table of derived message keys stored temporarily to decrypt delayed or out-of-order messages in a Double Ratchet session.
_Avoid_: Key cache, backlog buffer, replay cache
