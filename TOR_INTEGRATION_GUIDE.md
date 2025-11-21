# Tor Integration Guide for AnonChat System

## Overview

This guide provides step-by-step instructions for routing all chat communications through Tor for enhanced anonymity in the AnonChat Next.js application.

## 1. Prerequisites and Dependencies

### Install Required Packages
```bash
npm install socks-proxy-agent node-fetch @types/node-fetch
```

### Install and Configure Tor
```bash
# Ubuntu/Debian
sudo apt update && sudo apt install tor

# macOS
brew install tor

# Windows - Download from torproject.org
```

### Tor Configuration (`/etc/tor/torrc`)
```torrc
# Enable SOCKS proxy
SocksPort 9050
SocksPolicy accept 127.0.0.1

# Enable control port for circuit management
ControlPort 9051
CookieAuthentication 1

# Hidden service configuration (optional, for relay servers)
HiddenServiceDir /var/lib/tor/hidden_service/
HiddenServicePort 80 127.0.0.1:3000
```

## 2. Architectural Changes

### Current vs. Target Architecture

**Current**: Client → Next.js API Routes (in-memory relay)
**Target**: Client → Next.js API → External Tor Relay Network

### Create External Relay Infrastructure

Instead of in-memory storage, implement external relay servers that communicate via Tor hidden services.

## 3. Server-Side Tor Integration

### Modify API Routes to Use Tor

Update `app/api/relay/rooms/[roomId]/messages/route.ts`:

```typescript
import { torIntegration } from '@/lib/tor-integration';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest, { params }: { params: Promise<{ roomId: string }> }) {
  try {
    const { roomId } = await params;
    const message = await request.json();

    // Forward to external relay via Tor
    const relayUrl = process.env.RELAY_SERVER_URL; // e.g., 'http://relay.onion'

    const response = await torIntegration.fetchThroughTor(`${relayUrl}/rooms/${roomId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    });

    const result = await response.json();
    return NextResponse.json(result);
  } catch (error) {
    console.error('[Relay] Error:', error);
    return NextResponse.json({ error: 'Failed to relay message' }, { status: 500 });
  }
}
```

### Update Relay API Client

Modify `lib/relay-api.ts` to use Tor for external communications:

```typescript
import { torIntegration } from './tor-integration';

class RelayAPI {
  private baseUrl: string = process.env.RELAY_SERVER_URL || 'http://localhost:3000/api/relay';
  private useTor: boolean = process.env.USE_TOR === 'true';

  private async makeRequest(url: string, options: RequestInit = {}): Promise<Response> {
    if (this.useTor && torIntegration.isConnected()) {
      return await torIntegration.fetchThroughTor(url, options);
    }
    return fetch(url, options);
  }

  async joinRoom(roomId: string, userId: string, username: string): Promise<void> {
    const url = `${this.baseUrl}/rooms/${roomId}/join`;
    const response = await this.makeRequest(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, username, timestamp: Date.now() }),
    });

    if (!response.ok) {
      throw new Error(`Failed to join room: ${response.statusText}`);
    }
  }

  // Apply similar changes to sendMessage, pollMessages, etc.
}
```

## 4. Environment Configuration

### Create `.env.local`
```env
# Tor Configuration
TOR_CONTROL_PORT=9051
TOR_SOCKS_PORT=9050

# Relay Configuration
RELAY_SERVER_URL=http://your-relay-server.onion
USE_TOR=true

# Hidden Service (for relay servers)
HIDDEN_SERVICE_DIR=/var/lib/tor/hidden_service
```

## 5. Client-Side Tor Integration

### Browser Tor Proxy Setup

For web browsers, Tor integration requires additional setup. Create a Tor proxy configuration:

```typescript
// lib/tor-browser-integration.ts
export class TorBrowserIntegration {
  private proxyUrl: string = 'socks5://127.0.0.1:9050';

  async configureBrowserProxy(): Promise<void> {
    // Note: Direct browser proxy configuration requires extensions
    // Recommend using Tor Browser or browser extensions
    console.warn('Browser Tor proxy configuration requires manual setup or extensions');
  }

  getProxyUrl(): string {
    return this.proxyUrl;
  }
}
```

### Update Relay API for Client

Modify the client-side relay API to detect Tor availability:

```typescript
// In lib/relay-api.ts
class RelayAPI {
  private useTor: boolean = typeof window !== 'undefined' &&
    window.location.protocol === 'http:' &&
    process.env.NODE_ENV === 'production';

  private async makeRequest(url: string, options: RequestInit = {}): Promise<Response> {
    if (this.useTor) {
      // For client-side, recommend Tor Browser
      console.warn('Using Tor Browser recommended for full anonymity');
    }
    return fetch(url, options);
  }
}
```

## 6. Circuit Management

### Implement Circuit Rotation

Add circuit rotation for enhanced anonymity:

```typescript
// lib/relay-api.ts
class RelayAPI {
  private lastCircuitChange: number = 0;
  private circuitChangeInterval: number = 10 * 60 * 1000; // 10 minutes

  private async rotateCircuitIfNeeded(): Promise<void> {
    const now = Date.now();
    if (now - this.lastCircuitChange > this.circuitChangeInterval) {
      await torIntegration.getNewCircuit();
      this.lastCircuitChange = now;
    }
  }

  async sendMessage(message: RelayMessage): Promise<void> {
    await this.rotateCircuitIfNeeded();
    // ... rest of sendMessage
  }
}
```

## 7. Security Enhancements

### Add Request Anonymization

```typescript
// lib/relay-api.ts
private anonymizeRequest(options: RequestInit = {}): RequestInit {
  return {
    ...options,
    headers: {
      ...options.headers,
      'User-Agent': 'AnonChat/1.0',
      // Remove potentially identifying headers
    },
  };
}
```

## 8. Deployment Considerations

### Docker Configuration

Create `Dockerfile` with Tor:

```dockerfile
FROM node:18-alpine

# Install Tor
RUN apk add --no-cache tor

# Copy Tor configuration
COPY torrc /etc/tor/torrc

# Create Tor data directory
RUN mkdir -p /var/lib/tor && chown -R tor:tor /var/lib/tor

# Expose ports
EXPOSE 3000 9050 9051

# Start Tor and application
CMD tor & npm start
```

### Production Deployment

1. **Hidden Services**: Configure Tor hidden services for relay servers
2. **Bridge Nodes**: Use Tor bridges for censorship resistance
3. **Onion Routing**: Ensure all communications use .onion addresses
4. **Certificate Pinning**: Implement certificate pinning for relay servers

## 9. Testing and Monitoring

### Tor Status Monitoring

Add Tor status monitoring to the UI:

```typescript
// components/tor-status.tsx
import { torIntegration } from '@/lib/tor-integration';

export function TorStatus() {
  const [status, setStatus] = useState<TorStatus | null>(null);

  useEffect(() => {
    const stopMonitoring = torIntegration.startStatusMonitoring(setStatus);
    return stopMonitoring;
  }, []);

  return (
    <div className="tor-status">
      <div>Connected: {status?.connected ? '✅' : '❌'}</div>
      <div>Circuit: {status?.circuitEstablished ? '✅' : '❌'}</div>
      {status?.exitNodeCountry && <div>Exit: {status.exitNodeCountry}</div>}
    </div>
  );
}
```

## 10. Implementation Priority

1. **Phase 1**: Set up Tor infrastructure and basic proxy integration
2. **Phase 2**: Modify API routes to use external relays via Tor
3. **Phase 3**: Implement circuit rotation and anonymity enhancements
4. **Phase 4**: Add monitoring, testing, and production deployment

## Important Notes

- **Browser Limitations**: Web browsers cannot directly use SOCKS proxies. For full client-side anonymity, users must use Tor Browser.
- **Performance Impact**: Tor routing adds latency (typically 2-5x slower).
- **Legal Considerations**: Ensure compliance with local laws regarding anonymity tools.
- **Fallback Handling**: Implement graceful degradation when Tor is unavailable.

This implementation provides comprehensive Tor integration while maintaining the existing chat functionality.
