# AnonChat System Architecture

## Overview
AnonChat is a privacy-first, zero-storage messaging system combining Signal Protocol, Tor, and X3DH handshake for end-to-end encrypted communication.

## Core Components

### Cryptography Layer
- **X3DH Handshake** (`lib/x3dh-handshake.ts`)
  - Mutual authentication and secret derivation
  - 4-DH computation with identity and prekey validation
  - Provides forward secrecy on first message

- **Double Ratchet** (`lib/double-ratchet-enhanced.ts`)
  - Message-level ratcheting with chain keys
  - DH ratcheting for break-in recovery
  - Provides forward secrecy and post-compromise security

- **AES-256-GCM Encryption** (`lib/crypto.ts`)
  - Message encryption with authentication
  - Per-message IV and authentication tags

### Session & Contact Management
- **Session Manager** (`lib/session-manager.ts`)
  - Manages X3DH sessions per contact
  - Stores keys and session metadata

- **Contact Manager** (`lib/contact-manager.ts`)
  - Contact CRUD operations
  - Verification state and fingerprints
  - Out-of-band verification codes

### Network Layer
- **Relay API Client** (`lib/api-client.ts`)
  - Stateless relay communication
  - Send/Poll message operations
  - Sealed-sender style metadata protection

- **Tor Integration** (`lib/tor-integration.ts`)
  - Circuit management
  - Status monitoring
  - Anonymity verification

### QR Contact Exchange
- **QR Generator** (`lib/qr-generator.ts`)
  - SVG-based QR code generation
  - Contact identity encoding
  - Safe data serialization

## Data Flow

### Initial Contact Establishment
1. User A generates QR with identity + prekeys
2. User B scans QR and adds contact
3. X3DH handshake established on first message
4. Double Ratchet initialized from shared secret
5. Messages encrypted with chain keys

### Message Sending
1. User creates message
2. Double Ratchet produces message key via KDF-Chain
3. Message encrypted with AES-256-GCM
4. Payload sealed and sent via Relay
5. Relay forwards to recipient's Tor address

### Message Receiving
1. Client polls Relay for messages
2. Messages decrypted using receiving chain key
3. Chain key advanced for next message
4. Message displayed in UI

## Security Properties

### Threats Mitigated
- **Passive Network Surveillance**: Tor routing hides IP
- **Relay Compromise**: Sealed-sender hides metadata
- **Metadata Leaks**: No storage, no logs on relay
- **MITM Attacks**: X3DH mutual authentication
- **Identity Spoofing**: Out-of-band fingerprint verification
- **Future Decryption (PFS)**: Forward/post-compromise secrecy via Double Ratchet

### Verification Process
1. Contact shares fingerprint via QR or manual verification
2. Users compare SAS codes out-of-band (voice/video call)
3. Mark contact as verified in UI
4. Future messages show "Verified & Encrypted" status

## Deployment

### Requirements
- Tor daemon or Tor Browser integration
- Go relay server (stateless, no persistence)
- Client-side WebCrypto API support

### Environment Variables
- `NEXT_PUBLIC_RELAY_API_URL`: Relay endpoint (.onion address)
- `NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL`: Dev callback (optional)

## Future Enhancements
- Group messaging with multi-recipient support
- Media attachment encryption
- Message reactions and quotes
- Disappeared message timer
- Multi-device support
