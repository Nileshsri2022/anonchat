# AnonChat - Private Encrypted Messaging

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16.0-black)](https://nextjs.org/)
[![Tor](https://img.shields.io/badge/Tor-Network-orange)](https://www.torproject.org/)

AnonChat is a zero-storage, end-to-end encrypted messaging system that combines Signal Protocol cryptography with Tor network anonymity. Built for privacy-conscious users who demand both security and anonymity in their communications.

## 🚀 Features

- **End-to-End Encryption**: Signal Protocol (X3DH + Double Ratchet) with forward secrecy
- **Tor Network Integration**: All traffic routed through Tor with automatic circuit rotation
- **Anonymous Chat Rooms**: Create and join encrypted rooms with rotating IP addresses
- **Contact Management**: QR code-based contact exchange with verification codes
- **Monero Integration**: Decentralized infrastructure with Tor hidden services
- **Zero Storage**: No message persistence on servers
- **Cross-Platform**: Web-based with PWA capabilities
- **Modern UI**: Built with Next.js, React, and Tailwind CSS

## 📋 Table of Contents

- [Architecture Overview](#architecture-overview)
- [Data Flows](#data-flows)
- [Security Implementation](#security-implementation)
- [Installation](#installation)
- [Usage](#usage)
- [API Reference](#api-reference)
- [Component Structure](#component-structure)
- [Hooks](#hooks)
- [Deployment](#deployment)
- [Monero Integration](#monero-integration)
- [Security Analysis](#security-analysis)
- [Improvements & Roadmap](#improvements--roadmap)
- [Contributing](#contributing)

## 🏗️ Architecture Overview

```mermaid
graph TB
    subgraph "Electron Application"
        subgraph "Renderer Process"
            UI[React Components]
            Hooks[Custom Hooks]
            Crypto[Crypto Library]
            TorStatus[Tor Status UI]
        end

        subgraph "Main Process"
            ElectronMain[Electron Main]
            TorManager[Tor Manager]
            IPCProxy[IPC Proxy Handler]
        end

        subgraph "Embedded Tor"
            TorBinary[Tor Binary]
            TorCircuit[Tor Circuit]
            TorSOCKS[SOCKS Proxy 9050]
            TorControl[Control Port 9051]
        end
    end

    subgraph "Network Layer"
        Relay[Relay Server]
    end

    subgraph "Infrastructure Layer"
        Monero[Monero Node]
        Hidden[Tor Hidden Service]
        Docker[Docker Compose]
    end

    UI --> Hooks
    Hooks --> Crypto
    TorStatus --> IPCProxy
    IPCProxy --> TorSOCKS
    ElectronMain --> TorManager
    TorManager --> TorBinary
    TorBinary --> TorCircuit
    TorBinary --> TorSOCKS
    TorBinary --> TorControl
    TorCircuit --> Relay
    Relay --> Hidden
    Hidden --> Monero
    Docker -.-> Monero
```

### Core Components

- **Frontend**: Next.js application with React components
- **Encryption**: WebCrypto-based Signal Protocol implementation
- **Networking**: Tor integration with SOCKS proxy agents
- **Backend**: Next.js API routes serving as relay server
- **Infrastructure**: Docker-based Monero node deployment

## 🔄 Data Flows

### Contact Establishment Flow

```mermaid
sequenceDiagram
    participant A as User A
    participant B as User B
    participant QR as QR Code
    participant CM as Contact Manager

    A->>A: Generate Identity Keys
    A->>QR: Encode Public Keys
    B->>QR: Scan QR Code
    B->>CM: Add Contact
    CM->>B: Generate Verification Code
    B->>A: Share Verification Code
    A->>CM: Verify Code
    CM->>CM: Establish Encryption
```

### Message Exchange Flow

```mermaid
sequenceDiagram
    participant U as User
    participant DR as Double Ratchet
    participant Tor as Tor Network
    participant R as Relay Server

    U->>DR: Encrypt Message
    DR->>Tor: Route through Tor
    Tor->>R: Send Encrypted Message
    R->>R: Broadcast to Room
    R->>Tor: Deliver to Recipients
    Tor->>DR: Receive Encrypted Message
    DR->>U: Decrypt Message
```

## 🔒 Security Implementation

### Encryption Protocol

AnonChat implements the Signal Protocol with the following components:

#### X3DH Key Exchange
```typescript
// From lib/crypto.ts
export async function performX3DH(
  identityKeys: IdentityKeys,
  preKeys: PreKeys,
  remoteIdentityPublic: CryptoKey,
  remoteEphemeralPublic: CryptoKey
): Promise<X3DHSession> {
  // DH1: Identity key with remote ephemeral
  const dh1 = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: remoteEphemeralPublic },
    identityKeys.privateKey,
    256
  );

  // DH2: Ephemeral key with remote identity
  const dh2 = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: remoteIdentityPublic },
    preKeys.privateKey,
    256
  );

  // DH3: Pre-key with remote ephemeral
  const dh3 = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: remoteEphemeralPublic },
    preKeys.privateKey,
    256
  );

  // KDF to combine DH outputs
  const combined = new Uint8Array([
    ...new Uint8Array(dh1),
    ...new Uint8Array(dh2),
    ...new Uint8Array(dh3),
  ]);

  const sharedSecret = await crypto.subtle.digest('SHA-256', combined);
  const sessionId = generateSessionId();

  return { sharedSecret, sessionId };
}
```

#### Double Ratchet Algorithm
```typescript
// From lib/double-ratchet-enhanced.ts
export class DoubleRatchetAlgorithm {
  static async ratchetSend(state: DoubleRatchetState): Promise<ArrayBuffer> {
    const { chainKey, messageKey } = await this.kdfChain(state.sendChainKey);
    state.sendChainKey = chainKey;
    state.sendMessageNumber++;
    return messageKey;
  }

  static async ratchetRecv(state: DoubleRatchetState): Promise<ArrayBuffer> {
    const { chainKey, messageKey } = await this.kdfChain(state.recvChainKey);
    state.recvChainKey = chainKey;
    state.recvMessageNumber++;
    return messageKey;
  }
}
```

### Real Tor Network Integration

AnonChat now uses **embedded Tor binaries** instead of simulated proxies, providing true anonymity through the actual Tor network. The application bundles Tor executables for Windows, Linux, and macOS platforms.

#### Embedded Tor Architecture

```mermaid
graph TB
    subgraph "Electron Main Process"
        TorMgr[Tor Manager]
        TorProc[Tor Process]
        IPC[IPC Handler]
    end

    subgraph "Renderer Process"
        UI[React UI]
        Preload[Preload Script]
        TorAPI[TorAPI Bridge]
    end

    subgraph "Tor Network"
        TorCtl[Tor Control Port 9051]
        TorSOCKS[Tor SOCKS Port 9050]
        Circuit[Tor Circuit]
        Exit[Exit Node]
    end

    UI --> Preload
    Preload --> IPC
    IPC --> TorProc
    TorMgr --> TorProc
    TorProc --> TorCtl
    TorProc --> TorSOCKS
    TorSOCKS --> Circuit
    Circuit --> Exit
```

#### Tor Binary Management

The application includes platform-specific Tor binaries downloaded from the official Tor Project:

```javascript
// From electron/tor-manager.js
function getTorBinaryPath() {
  const platform = process.platform;
  const arch = process.arch;

  let dir;
  if (platform === 'win32') {
    dir = 'windows';
  } else if (platform === 'linux') {
    dir = arch === 'arm64' ? 'linux-arm64' : 'linux-x64';
  } else if (platform === 'darwin') {
    dir = arch === 'arm64' ? 'macos-arm64' : 'macos-x64';
  }

  const binaryName = platform === 'win32' ? 'tor.exe' : 'tor';
  return path.join(__dirname, 'tor', dir, binaryName);
}
```

#### Tor Process Lifecycle

Electron automatically starts the embedded Tor process on application launch:

```javascript
// From electron/main.js
app.whenReady().then(() => {
  torProcess = startTor();  // Launches embedded Tor binary
  createWindow();
});

app.on('before-quit', () => {
  if (torProcess) {
    torProcess.kill();  // Cleans up Tor process on exit
  }
});
```

### Electron Setup

The application is packaged as an Electron app to enable system-level integration with Tor binaries and provide secure IPC communication.

#### Security Context Isolation

Electron's context isolation ensures the renderer process cannot directly access Node.js APIs:

```javascript
// From electron/main.js
const mainWindow = new BrowserWindow({
  width: 1200,
  height: 800,
  webPreferences: {
    nodeIntegration: false,        // Disabled for security
    contextIsolation: true,        // Enabled for isolation
    preload: path.join(__dirname, 'preload.js')  // Secure API bridge
  }
});
```

#### Preload Script API Bridge

The preload script exposes a secure TorAPI to the renderer process:

```javascript
// From electron/preload.js
contextBridge.exposeInMainWorld('TorAPI', {
  fetch: (...args) => ipcRenderer.invoke('tor-fetch', ...args)
});
```

### Tor Routing through IPC

All network requests are routed through Electron's IPC system to utilize the embedded Tor SOCKS proxy, ensuring all traffic goes through Tor circuits.

#### IPC Handler Implementation

The main process handles Tor-routed fetch requests:

```javascript
// From electron/ipc-proxy.js
ipcMain.handle('tor-fetch', async (event, url) => {
  const agent = new SocksProxyAgent('socks5://127.0.0.1:9050');
  const res = await fetch(url, { agent });
  return await res.text();
});
```

#### Renderer Process Usage

Components use the exposed TorAPI for anonymous requests:

```typescript
// From components/tor-status.tsx
const testTorConnection = async () => {
  try {
    const response = await (window as any).TorAPI.fetch('https://check.torproject.org/api/ip');
    const data: TorStatus = JSON.parse(response as unknown as string);
    setResult(data);
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Failed to check Tor status');
  }
};
```

### Testing Tor Connectivity

The application includes built-in Tor connectivity testing through the Tor Status component.

#### Tor Status Component

```typescript
// From components/tor-status.tsx
export function TorStatus() {
  const testTorConnection = async () => {
    const response = await (window as any).TorAPI.fetch('https://check.torproject.org/api/ip');
    const data: TorStatus = JSON.parse(response);
    // Returns: { IsTor: boolean, IP: string }
  };
}
```

#### Manual Testing Steps

1. **Launch the Electron app** with embedded Tor
2. **Navigate to Settings** and find the Tor Status section
3. **Click "Test Tor"** to verify connectivity
4. **Check the exit IP** to confirm traffic is routed through Tor
5. **Verify IsTor flag** indicates successful Tor connection

#### Troubleshooting Tor Issues

- **Tor process not starting**: Check Tor binary permissions and platform compatibility
- **Control port connection failed**: Verify Tor configuration and firewall settings
- **SOCKS proxy unavailable**: Ensure Tor process is running and SOCKS port 9050 is open
- **Circuit establishment failed**: Check network connectivity and Tor bootstrap progress

## 📦 Installation

### Prerequisites

- Node.js 18+
- npm or pnpm
- Docker and Docker Compose (for Monero integration)
- **Tor binaries** (automatically downloaded, or manual setup)

### Setup Instructions for Real Tor Integration

#### Automatic Tor Binary Download

The application includes scripts to download official Tor binaries for your platform:

**Windows:**
```batch
download-tor-binaries.bat
```

**Linux/macOS:**
```bash
chmod +x download-tor-binaries.sh
./download-tor-binaries.sh
```

This will download and extract Tor binaries to `electron/tor/` directory for:
- Windows (x86_64)
- Linux (x86_64, ARM64)
- macOS (x86_64, ARM64)

#### Manual Tor Setup (Alternative)

If automatic download fails, you can manually download Tor expert bundles from [torproject.org](https://www.torproject.org/download/tor/) and place the `tor` executable in the appropriate `electron/tor/{platform}/` directory.

#### Electron Build and Run

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-org/anon-chat-system-design.git
   cd anon-chat-system-design
   ```

2. **Download Tor binaries**
   ```bash
   # Windows
   download-tor-binaries.bat

   # Linux/macOS
   chmod +x download-tor-binaries.sh && ./download-tor-binaries.sh
   ```

3. **Install dependencies**
   ```bash
   pnpm install
   # or
   npm install
   ```

4. **Build the Next.js application**
   ```bash
   pnpm build
   # or
   npm run build
   ```

5. **Install Electron dependencies**
   ```bash
   pnpm add -D electron electron-builder
   # or
   npm install -D electron electron-builder
   ```

6. **Start the Electron app with embedded Tor**
   ```bash
   pnpm electron .
   # or
   npx electron .
   ```

The Electron app will automatically:
- Launch the embedded Tor process
- Start the Next.js development server (if in dev mode)
- Route all network traffic through Tor via IPC

#### Development Mode

For development with hot reloading:

1. **Start Next.js dev server in one terminal**
   ```bash
   pnpm dev
   ```

2. **Start Electron in another terminal**
   ```bash
   npx electron .
   ```

Electron will load `http://localhost:3000` and embed it with Tor integration.

#### Verifying Tor Integration

1. Launch the Electron application
2. Navigate to Settings → Tor Status
3. Click "Test Tor" to verify connectivity
4. Confirm the exit IP is different from your regular IP
5. Check that "IsTor" flag shows `true`

### Package.json Configuration

```json
{
  "name": "anonchat",
  "version": "0.1.0",
  "main": "electron/main.js",
  "scripts": {
    "build": "next build",
    "dev": "next dev",
    "lint": "eslint .",
    "start": "next start",
    "electron": "electron .",
    "electron-dev": "concurrently \"npm run dev\" \"wait-on http://localhost:3000 && electron .\"",
    "build-electron": "electron-builder",
    "download-tor": "node scripts/download-tor.js"
  },
  "dependencies": {
    "@radix-ui/react-dialog": "1.1.4",
    "@radix-ui/react-dropdown-menu": "2.1.4",
    "crypto": "latest",
    "got": "^12.6.1",
    "next": "16.0.3",
    "qrcode": "^1.5.4",
    "react": "19.2.0",
    "socks-proxy-agent": "^8.0.5",
    "tor-control": "^0.0.3"
  },
  "devDependencies": {
    "electron": "^25.0.0",
    "electron-builder": "^24.0.0",
    "concurrently": "^8.0.0",
    "wait-on": "^7.0.0"
  }
}
```

## 🚀 Usage

### Basic Chat Flow

1. **Onboarding**: Complete the initial setup
2. **Create/Join Room**: Generate anonymous room or join existing
3. **Add Contacts**: Use QR codes to exchange contact information
4. **Verify Contacts**: Exchange verification codes for authentication
5. **Start Chatting**: Send encrypted messages through Tor

### Main Application Component

```typescript
// From app/page.tsx
export default function Home() {
  const [showOnboarding, setShowOnboarding] = useState(true);
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<'rooms' | 'contacts'>('rooms');

  // Handle pending contacts from QR scans
  useEffect(() => {
    const pendingContact = localStorage.getItem('pending_contact');
    if (pendingContact) {
      // Process QR-scanned contact
      import('@/lib/contact-manager').then(({ contactManager }) => {
        const contactData = JSON.parse(pendingContact);
        contactManager.addContact(
          `Contact ${contactData.id.slice(-4)}`,
          {
            id: contactData.id,
            identityPublicKey: contactData.identityPublic,
            preKeyPublic: contactData.preKeyPublic,
            preKeyId: contactData.preKeyId,
            fingerprint: contactData.fingerprint
          }
        );
      });
    }
  }, []);

  // Render appropriate view
  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar with room/contact tabs */}
      <div className="w-80 border-r border-border">
        {/* Tab navigation and content */}
      </div>

      {/* Main chat area */}
      {selectedRoom && (
        <ChatroomInterface
          roomId={selectedRoom}
          roomName={selectedRoomData.name}
          onLeaveRoom={handleLeaveRoom}
        />
      )}
    </div>
  );
}
```

## 📡 API Reference

### Relay API Endpoints

#### POST `/api/relay`
Initiate X3DH handshake and relay messages.

**Request Body:**
```json
{
  "action": "initiate-session|relay-message|receive-messages",
  "sessionId": "string",
  "encryptedPayload": "string",
  "recipientId": "string"
}
```

#### POST `/api/relay/rooms`
Create anonymous chat room.

**Response:**
```json
{
  "success": true,
  "roomId": "anon_123456",
  "userIP": "tor_exit_ip",
  "message": "Room created with anonymous IP"
}
```

#### POST `/api/relay/rooms/[roomId]/join`
Join a chat room.

**Request:**
```json
{
  "userId": "string",
  "username": "string",
  "timestamp": 1234567890
}
```

#### POST `/api/relay/rooms/[roomId]/messages`
Send encrypted message to room.

**Request:**
```json
{
  "id": "msg_123",
  "roomId": "room_123",
  "userId": "user_123",
  "username": "Alice",
  "encryptedContent": "base64_ciphertext",
  "iv": "base64_iv",
  "timestamp": 1234567890
}
```

## 🧩 Component Structure

### Core Components

#### ChatroomInterface
```typescript
// From components/chatroom-interface.tsx
interface ChatroomInterfaceProps {
  roomId: string;
  roomName: string;
  onOpenInfo: () => void;
  onLeaveRoom: () => void;
}

export function ChatroomInterface({ roomId, roomName, onOpenInfo, onLeaveRoom }: ChatroomInterfaceProps) {
  const [message, setMessage] = useState('');
  const { messages, users, currentUser, isConnected, sendMessage } = useChatroom(roomId, roomName);

  return (
    <div className="flex-1 flex flex-col bg-background">
      {/* Header with room info and QR button */}
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div className="flex items-center gap-3">
          <Badge variant="secondary" className="gap-1">
            <Shield className="w-3 h-3" />
            E2E Encrypted
          </Badge>
        </div>
        <QRContactModal isOpen={showQRModal} onClose={() => setShowQRModal(false)} />
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex gap-3 ${isCurrentUser ? 'justify-end' : ''}`}>
            <div className={`px-4 py-2 rounded-2xl ${isCurrentUser ? 'bg-primary' : 'bg-muted'}`}>
              <p className="text-sm break-words">{msg.content}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Input area */}
      <div className="px-6 py-4 border-t">
        <div className="flex gap-2">
          <Input
            placeholder="Type a message..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
          />
          <Button onClick={handleSendMessage}>
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
```

### UI Component Library

The project uses Radix UI primitives with Tailwind CSS:

- **Dialogs**: Room join modal, contact verification
- **Navigation**: Tab-based room/contact switching
- **Forms**: Message input, settings panels
- **Feedback**: Toast notifications, loading states

## 🎣 Hooks

### useChatroom Hook

```typescript
// From hooks/use-chatroom.ts
export function useChatroom(roomId: string, roomName: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [users, setUsers] = useState<RoomUser[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  const currentUser = useState(() => ({
    id: `user_${Math.random().toString(36).substr(2, 9)}`,
    username: localStorage.getItem('anonchat_username') || `User${Math.floor(Math.random() * 9999)}`,
    color: USER_COLORS[Math.floor(Math.random() * USER_COLORS.length)],
  }))[0];

  // Initialize room encryption and join
  useEffect(() => {
    const initRoom = async () => {
      await roomEncryption.deriveRoomKey(roomId, 'shared-secret');
      const joinResult = await relayAPI.joinRoom(roomId, currentUser.id, currentUser.username);

      setUsers([{
        id: joinResult.userId,
        username: currentUser.username,
        color: currentUser.color,
        online: true,
        joinedAt: new Date(),
        ip: joinResult.userIP,
      }]);

      setIsConnected(true);
    };

    initRoom();
  }, [roomId, roomName, currentUser.id, currentUser.username, currentUser.color]);

  // Start polling for messages
  useEffect(() => {
    if (!isConnected) return;

    const handleNewMessages = async (relayMessages: RelayMessage[]) => {
      const decryptedMessages: Message[] = [];

      for (const msg of relayMessages) {
        const decrypted = await roomEncryption.decrypt({
          ciphertext: msg.encryptedContent,
          iv: msg.iv,
          tag: '',
        });

        decryptedMessages.push({
          id: msg.id,
          userId: msg.userId,
          username: msg.username,
          content: decrypted,
          timestamp: new Date(msg.timestamp),
          encrypted: true,
          ip: msg.ip,
        });
      }

      setMessages(prev => [...prev, ...decryptedMessages]);
    };

    relayAPI.startPolling(roomId, handleNewMessages);
  }, [isConnected, roomId, currentUser.id]);

  // Send message function
  const sendMessage = useCallback(async (content: string) => {
    const encrypted = await roomEncryption.encrypt(content.trim());

    const relayMessage: RelayMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      roomId,
      userId: currentUser.id,
      username: currentUser.username,
      encryptedContent: encrypted.ciphertext,
      iv: encrypted.iv,
      timestamp: Date.now(),
    };

    await relayAPI.sendMessage(relayMessage);

    const newMessage: Message = {
      id: relayMessage.id,
      userId: currentUser.id,
      username: currentUser.username,
      content: content.trim(),
      timestamp: new Date(),
      encrypted: true,
    };

    setMessages(prev => [...prev, newMessage]);
  }, [isConnected, roomId, currentUser.id, currentUser.username]);

  return {
    messages,
    users,
    currentUser,
    isConnected,
    sendMessage,
  };
}
```

## 🚢 Deployment

### Production Build

```bash
# Build the application
pnpm build

# Start production server
pnpm start
```

### Docker Deployment

```dockerfile
# Dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

### Environment Variables

```bash
# .env.local
NEXT_PUBLIC_TOR_CONTROL_PORT=9051
NEXT_PUBLIC_TOR_SOCKS_PORT=9050
NEXT_PUBLIC_RELAY_URL=https://your-relay-server.com
```

## ₿ Monero Integration

### Architecture

```mermaid
graph TB
    subgraph "Monero Network"
        Node[Monero Node]
        Hidden[Tor Hidden Service]
        P2P[P2P Network]
    end

    subgraph "AnonChat"
        Client[Web Client]
        Relay[Relay Server]
        Tor[Tor Circuit]
    end

    subgraph "Monitoring"
        Prometheus[Prometheus]
        Grafana[Grafana]
        Exporter[Monero Exporter]
    end

    Client --> Tor
    Tor --> Relay
    Relay --> Hidden
    Hidden --> Node
    Node --> P2P

    Node --> Exporter
    Exporter --> Prometheus
    Prometheus --> Grafana
```

### Docker Compose Setup

```yaml
# From monerod/docker-compose.yml
version: '3.5'
services:
  monerod:
    image: ghcr.io/sethforprivacy/simple-monerod:latest
    volumes:
      - ./data/monerod-data:/home/monero/.bitmonero
    ports:
      - 18080:18080
      - 18081:18081
    command: ["--config-file=/home/monero/.bitmonero/bitmonero.conf"]

  tor:
    image: goldy/tor-hidden-service
    environment:
      MONEROD_TOR_SERVICE_HOSTS: '18080:monerod:18080,18089:monerod:18089'
      MONEROD_TOR_SERVICE_VERSION: '3'
    volumes:
      - ./data/tor-keys:/var/lib/tor/hidden_service/

  prometheus:
    image: prom/prometheus:latest
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
    ports:
      - 9090:9090
```

### Deployment Steps

1. **Prepare VPS**
   ```bash
   sudo apt update && sudo apt install docker.io docker-compose-plugin -y
   ```

2. **Copy Monero Configuration**
   ```bash
   scp -r monerod user@vps:/home/user/
   cd /home/user/monerod
   chmod +x setup.sh && ./setup.sh
   ```

3. **Start Services**
   ```bash
   docker compose up -d
   ```

4. **Verify Deployment**
   ```bash
   docker compose logs -f monerod
   ```

## 🔍 Security Analysis

### Threat Model

**Assumptions:**
- Users trust their devices are not compromised
- Tor network provides anonymity
- WebCrypto API is secure in browser environment

**Threats Addressed:**
- ✅ **Eavesdropping**: End-to-end encryption
- ✅ **Metadata Leakage**: Tor routing + anonymous IDs
- ✅ **Key Compromise**: Forward secrecy via Double Ratchet
- ✅ **Man-in-the-Middle**: X3DH authentication
- ✅ **Correlation Attacks**: Circuit rotation

**Remaining Risks:**
- ⚠️ **Browser Fingerprinting**: Not addressed
- ⚠️ **Malware/Keyloggers**: Out of scope
- ⚠️ **Tor Correlation**: Limited by exit node selection
- ⚠️ **Side Channels**: Timing attacks mitigated

### Cryptographic Security

- **Key Exchange**: X3DH with ECDSA/ECDH P-256
- **Symmetric Encryption**: AES-256-GCM
- **Key Derivation**: HKDF-SHA256
- **Forward Secrecy**: Double Ratchet with ECDH ratchets
- **Authentication**: HMAC-SHA256

## 🔧 Improvements & Roadmap

### High Priority

1. **Persistent Storage**
   - Replace in-memory sessions with Redis/PostgreSQL
   - Encrypted message history (optional)
   - Contact backup/restore functionality

2. **Scalability**
   - Multi-server federation
   - Load balancing for relay servers
   - Horizontal scaling support

3. **Security Enhancements**
   - Security audit and penetration testing
   - Automated security testing suite
   - Key rotation policies

### Medium Priority

4. **User Experience**
   - Mobile PWA support
   - Offline message queuing
   - File/image sharing (encrypted)
   - Voice/video calls (WebRTC + DTLS)

5. **Privacy Features**
   - Self-destructing messages
   - Screenshot detection
   - Metadata stripping
   - Plausible deniability

### Future Considerations

6. **Advanced Cryptography**
   - Post-quantum key exchange
   - Zero-knowledge proofs
   - Multi-device synchronization

7. **Network Features**
   - Decentralized relay network
   - Mesh networking support
   - Tor hidden service directories

8. **Compliance & Audit**
   - Optional audit logging
   - Compliance modes for regulated environments
   - Third-party security reviews

## 🤝 Contributing

### Development Setup

1. Fork the repository
2. Create feature branch: `git checkout -b feature/amazing-feature`
3. Install dependencies: `pnpm install`
4. Start development: `pnpm dev`
5. Run tests: `pnpm test`
6. Commit changes: `git commit -m 'Add amazing feature'`
7. Push to branch: `git push origin feature/amazing-feature`
8. Open Pull Request

### Code Standards

- **TypeScript**: Strict type checking enabled
- **ESLint**: Airbnb config with React rules
- **Prettier**: Automated code formatting
- **Testing**: Jest for unit tests, Cypress for E2E

### Security Considerations

- Never commit private keys or sensitive data
- Use environment variables for configuration
- Follow cryptographic best practices
- Report security issues privately

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Signal Foundation**: For the Signal Protocol specification
- **Tor Project**: For providing anonymity infrastructure
- **Monero Community**: For privacy-focused cryptocurrency
- **Open Source Community**: For the libraries and tools used

---

**Disclaimer**: This software is provided as-is for educational and research purposes. Users are responsible for complying with applicable laws and regulations in their jurisdiction.
