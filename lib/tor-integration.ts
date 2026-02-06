import { SocksProxyAgent } from 'socks-proxy-agent';
import { Socket } from 'net';
export interface TorStatus {
  connected: boolean;
  circuitEstablished: boolean;
  exitNodeCountry?: string;
  latency?: number;
  circuitId?: string;
}

export interface CircuitHop {
  nickname: string;
  ip?: string;
  country?: string;
}

export interface CircuitInfo {
  circuitId: string;
  hops: {
    guard: CircuitHop | null;
    middle: CircuitHop | null;
    exit: CircuitHop | null;
  };
}

interface Circuit {
  id: string;
  status: string;
  path: string[];
  metadata?: string;
}

export class TorIntegration {
  private statusCheckInterval: number = 30000; // 30 seconds
  private torControlPort: number = 9051; // Default Tor control port
  private torSocksPort: number = 9050; // Default Tor SOCKS port
  private lastStatus: TorStatus = {
    connected: false,
    circuitEstablished: false,
  };
  private controlSocket: Socket | null = null;
  private proxyAgent: SocksProxyAgent | null = null;
  private authenticated: boolean = false;

  constructor(controlPort: number = 9051, socksPort: number = 9050) {
    this.torControlPort = controlPort;
    this.torSocksPort = socksPort;
    this.initializeProxyAgent();
  }

  private initializeProxyAgent() {
    try {
      this.proxyAgent = new SocksProxyAgent(`socks5://127.0.0.1:${this.torSocksPort}`);
    } catch (error) {
      console.error('Failed to initialize SOCKS proxy agent:', error);
    }
  }

  private async connectTorControl(): Promise<boolean> {
    return new Promise((resolve) => {
      if (this.controlSocket && !this.controlSocket.destroyed) {
        resolve(true);
        return;
      }

      this.controlSocket = new Socket();
      this.controlSocket.connect(this.torControlPort, '127.0.0.1');

      this.controlSocket.on('connect', () => {
        console.log('Connected to Tor control port');
        resolve(true);
      });

      this.controlSocket.on('error', (error) => {
        console.error('Tor control connection error:', error);
        resolve(false);
      });

      this.controlSocket.on('timeout', () => {
        console.error('Tor control connection timeout');
        resolve(false);
      });

      this.controlSocket.setTimeout(5000);
    });
  }

  private async sendTorCommand(command: string): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.controlSocket || this.controlSocket.destroyed) {
        reject(new Error('Tor control not connected'));
        return;
      }

      // CRITICAL: Remove ALL existing 'data' listeners AND drain the buffer
      this.controlSocket.removeAllListeners('data');

      // Pause and resume to clear any buffered data
      this.controlSocket.pause();
      this.controlSocket.resume();

      const fullCommand = command + '\r\n';
      let response = '';
      let timeoutId: NodeJS.Timeout;

      const onData = (data: Buffer) => {
        response += data.toString();

        // Check if response is complete
        // Tor responses end with "250 OK\r\n" or "250 <text>\r\n"
        // Multi-line responses use "250+" or "250-" then final "250 OK" or "250 <text>"
        const lines = response.split('\r\n');

        let isComplete = false;

        // Check from the end of the response for completion markers
        for (let i = lines.length - 1; i >= 0; i--) {
          const line = lines[i].trim();

          // Skip empty lines
          if (!line) continue;

          // Found final status line
          if (line === '250 OK' ||
            (line.startsWith('250 ') && !line.startsWith('250+') && !line.startsWith('250-'))) {
            isComplete = true;
            break;
          }

          // Error response
          if (line.startsWith('5') || line.startsWith('4')) {
            isComplete = true;
            break;
          }

          // If we hit a non-status line, keep waiting
          if (!line.startsWith('250')) {
            break;
          }
        }

        if (isComplete) {
          clearTimeout(timeoutId);
          this.controlSocket!.removeListener('data', onData);

          // Check for success
          if (response.includes('250')) {
            resolve(response);
          } else {
            const firstLine = response.split('\r\n')[0];
            reject(new Error(`Tor command failed: ${firstLine}`));
          }
        }
      };

      this.controlSocket.on('data', onData);

      // Write command AFTER setting up listener
      this.controlSocket.write(fullCommand);

      timeoutId = setTimeout(() => {
        this.controlSocket!.removeListener('data', onData);
        reject(new Error(`Tor control connection timeout`));
      }, 10000);
    });
  }

  async checkTorStatus(): Promise<TorStatus> {
    try {
      const connected = await this.connectTorControl();
      if (!connected) {
        this.lastStatus = {
          connected: false,
          circuitEstablished: false,
        };
        return this.lastStatus;
      }

      // Try to get circuit status
      try {
        const circuitResponse = await this.sendTorCommand('GETINFO circuit-status');
        const circuits = this.parseCircuitStatus(circuitResponse);
        const activeCircuit = circuits.find(c => c.status === 'BUILT');

        this.lastStatus = {
          connected: true,
          circuitEstablished: !!activeCircuit,
          circuitId: activeCircuit?.id,
        };
      } catch (error) {
        // Fallback to basic connectivity check
        this.lastStatus = {
          connected: true,
          circuitEstablished: false,
        };
      }
    } catch (error) {
      console.error('Tor status check failed:', error);
      this.lastStatus = {
        connected: false,
        circuitEstablished: false,
      };
    }

    return this.lastStatus;
  }

  private parseCircuitStatus(response: string): Array<{ id: string; status: string }> {
    const lines = response.split('\r\n');
    const circuits: Array<{ id: string; status: string }> = [];

    for (const line of lines) {
      if (line.startsWith('250-circuit-status=')) {
        const parts = line.split(' ');
        if (parts.length >= 2) {
          const circuitInfo = parts[1].split(',');
          const id = circuitInfo[0];
          const status = circuitInfo[1];
          circuits.push({ id, status });
        }
      }
    }

    return circuits;
  }

  async getNewCircuit(): Promise<boolean> {
    try {
      const connected = await this.connectTorControl();
      if (!connected) {
        return false;
      }

      await this.sendTorCommand('SIGNAL NEWNYM');
      console.log('Requested new Tor circuit');

      // Wait for circuit to establish
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Re-check status
      await this.checkTorStatus();
      return true;
    } catch (error) {
      console.error('Failed to get new circuit:', error);
      return false;
    }
  }

  async getCurrentIP(): Promise<string | null> {
    try {
      // Note: Browser fetch cannot use SOCKS proxy directly
      // This method checks if Tor control is accessible
      // For actual IP verification, use external services or check.torproject.org

      const connected = await this.connectTorControl();
      if (!connected) {
        console.log('❌ Tor control port not accessible');
        return null;
      }

      // Get circuit information to show Tor is working
      const circuitResponse = await this.sendTorCommand('GETINFO circuit-status');
      const circuits = this.parseCircuitStatus(circuitResponse);
      const activeCircuit = circuits.find(c => c.status === 'BUILT');

      if (activeCircuit) {
        console.log('🌐 Tor Circuit Active - ID:', activeCircuit.id);
        console.log('🔄 Tor circuits established - traffic is anonymized');

        // Since we can't fetch through SOCKS in browser, show circuit info
        console.log('📍 To verify your Tor IP, visit: https://check.torproject.org/');
        console.log('📍 Or use: https://www.whatismyipaddress.com/ through Tor Browser');

        return activeCircuit.id; // Return circuit ID as confirmation
      } else {
        console.log('⚠️ Tor connected but no active circuits');
        return null;
      }
    } catch (error) {
      console.error('❌ Failed to check Tor circuit status:', error);
      return null;
    }
  }

  async logTorIPStatus(): Promise<void> {
    try {
      console.log('🔍 Checking Tor connectivity and circuit status...');

      const status = await this.checkTorStatus();
      console.log('🔍 Tor Status:', status);

      if (status.connected && status.circuitEstablished) {
        console.log('✅ Tor daemon connected and circuit established');

        const circuitInfo = await this.getCurrentIP();
        if (circuitInfo) {
          console.log('✅ CONFIRMED: Tor circuits active - traffic is anonymized');
          console.log('🔄 Active Circuit ID:', circuitInfo);
          console.log('🌐 Your traffic is routed through Tor exit nodes');
          console.log('');
          console.log('📋 To verify your Tor exit IP:');
          console.log('   1. Open Tor Browser');
          console.log('   2. Visit: https://check.torproject.org/');
          console.log('   3. Or visit: https://www.whatismyipaddress.com/');
          console.log('   4. Your IP should be different from your regular IP');
        } else {
          console.log('⚠️ Tor connected but circuit verification failed');
        }
      } else {
        console.log('❌ Tor not fully connected');
        if (!status.connected) {
          console.log('   - Tor daemon not accessible on control port 9051');
        }
        if (!status.circuitEstablished) {
          console.log('   - No active Tor circuits established');
        }
      }

      console.log('');
      console.log('🔧 Troubleshooting:');
      console.log('   - Ensure Tor daemon is running');
      console.log('   - Check ports 9051 (control) and 9050 (SOCKS) are open');
      console.log('   - Verify no firewall blocking localhost connections');

    } catch (error) {
      console.error('❌ Tor status check failed:', error);
      console.log('');
      console.log('🔧 Possible issues:');
      console.log('   - Tor daemon not installed or not running');
      console.log('   - Control port 9051 not accessible');
      console.log('   - Firewall blocking local connections');
    }
  }

  async fetchThroughTor(url: string, options: RequestInit = {}): Promise<any> {
    if (!this.proxyAgent) {
      throw new Error('Tor proxy agent not initialized');
    }

    // For server-side use only
    const { default: fetch } = await import('node-fetch');

    return fetch(url, {
      ...options,
      agent: this.proxyAgent,
    } as any);
  }

  getProxyAgent(): SocksProxyAgent | null {
    return this.proxyAgent;
  }

  getProxyUrl(): string | null {
    return this.proxyAgent ? `socks5://127.0.0.1:${this.torSocksPort}` : null;
  }

  isConnected(): boolean {
    return this.lastStatus.connected;
  }

  startStatusMonitoring(onStatusChange?: (status: TorStatus) => void): () => void {
    const interval = setInterval(async () => {
      const newStatus = await this.checkTorStatus();
      if (JSON.stringify(newStatus) !== JSON.stringify(this.lastStatus)) {
        this.lastStatus = newStatus;
        onStatusChange?.(newStatus);
      }
    }, this.statusCheckInterval);

    return () => clearInterval(interval);
  }

  async cleanup() {
    if (this.controlSocket && !this.controlSocket.destroyed) {
      this.controlSocket.end();
      this.controlSocket = null;
    }
  }

  /**
   * Get current Tor circuit information (Guard → Middle → Exit)
   * Mimics Tor Browser's circuit display
   */
  async getCircuitInfo(): Promise<CircuitInfo | null> {
    try {
      if (!this.authenticated) {
        const connected = await this.connectTorControl();
        if (!connected) return null;

        // Authenticate (no password needed with CookieAuthentication 0)
        try {
          await this.sendTorCommand('AUTHENTICATE ""');
          this.authenticated = true;
        } catch (error) {
          console.error('Tor authentication failed:', error);
          return null;
        }
      }

      // Get circuit status
      const raw = await this.sendTorCommand('GETINFO circuit-status');
      const circuits = this.parseCircuits(raw);

      // Pick ONE usable circuit (like Tor Browser)
      const active = circuits.find(c =>
        c.status === 'BUILT' &&
        !c.metadata?.includes('HS_SERVICE')
      );

      if (!active) {
        console.log('No active BUILT circuits found');
        return null;
      }

      console.log(`🎯 Selected circuit ${active.id} with ${active.path.length} hops`);
      console.log(`   Fingerprints:`, active.path);

      // Resolve node info for each hop SEQUENTIALLY to avoid socket buffer issues
      const nodes: CircuitHop[] = [];
      for (let i = 0; i < active.path.length; i++) {
        const fp = active.path[i];
        console.log(`   Fetching info for hop ${i + 1}: ${fp}`);

        const nodeInfo = await this.getNodeInfo(fp);
        nodes.push(nodeInfo);

        // Small delay between queries to ensure socket buffer is clear
        if (i < active.path.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      console.log(`✅ Resolved ${nodes.length} nodes:`, nodes);

      const circuitInfo = {
        circuitId: active.id,
        hops: {
          guard: nodes[0] ?? null,
          middle: nodes[1] ?? null,
          exit: nodes[2] ?? null
        }
      };

      console.log(`📊 Final circuit info:`, circuitInfo);

      return circuitInfo;
    } catch (error) {
      console.error('Failed to get circuit info:', error);
      return null;
    }
  }

  /**
   * Parse circuit status response from Tor
   */
  private parseCircuits(response: string): Circuit[] {
    const circuits: Circuit[] = [];

    console.log('📋 Raw circuit response:', response);

    response.split('\r\n').forEach(line => {
      if (!line || line.startsWith('250')) return;

      const parts = line.split(' ');
      if (parts.length < 3) return;

      const id = parts[0];
      const status = parts[1];
      const path = parts[2];
      const metadata = parts.slice(3).join(' ');

      console.log(`🔍 Parsing circuit ${id}: status=${status}, path=${path}`);

      if (status !== 'BUILT') return;

      // Extract fingerprints from path (format: $FP1~name1,$FP2~name2,$FP3~name3)
      const fingerprints = path
        .split(',')
        .map(n => {
          const match = n.match(/\$([A-F0-9]+)/);
          if (match) {
            console.log(`  ✓ Extracted fingerprint: ${match[1]}`);
            return match[1];
          }
          return null;
        })
        .filter(Boolean) as string[];

      console.log(`  📊 Total fingerprints extracted: ${fingerprints.length}`, fingerprints);

      if (fingerprints.length >= 3) {
        circuits.push({
          id,
          status,
          path: fingerprints,
          metadata
        });
      } else {
        console.warn(`  ⚠️ Circuit ${id} has only ${fingerprints.length} hops, skipping`);
      }
    });

    console.log(`✅ Parsed ${circuits.length} BUILT circuits`);
    return circuits;
  }

  /**
   * Get node information (nickname, IP, country)
   */
  private async getNodeInfo(fingerprint: string): Promise<CircuitHop> {
    try {
      console.log(`      🔍 Querying Tor for fingerprint: ${fingerprint}`);
      const response = await this.sendTorCommand(`GETINFO ns/id/${fingerprint}`);
      console.log(`      📄 Tor response for ${fingerprint.substring(0, 8)}:`, response.substring(0, 200));

      // Parse node descriptor (format: "r nickname identity published IP ORPort DirPort")
      const line = response
        .split('\r\n')
        .find(l => l.startsWith('r '));

      if (!line) {
        console.warn(`      ⚠️ No 'r' line found for ${fingerprint.substring(0, 8)}`);
        return { nickname: 'Unknown' };
      }

      console.log(`      📋 Parsing line: ${line}`);
      const parts = line.split(' ');
      const nickname = parts[1];
      const ip = parts[6];

      console.log(`      ✅ Extracted: nickname=${nickname}, ip=${ip}`);

      let country: string | undefined;

      // Get country code via GeoIP (only if IP is valid)
      if (/^\d+\.\d+\.\d+\.\d+$/.test(ip)) {
        try {
          console.log(`      🌍 Querying Tor GeoIP for ${ip}...`);
          const geo = await this.sendTorCommand(`GETINFO ip-to-country/${ip}`);
          console.log(`      📄 Tor GeoIP response: ${geo}`);

          const match = geo.match(/ip-to-country\/[\d.]+=(..)/i);
          if (match && match[1] !== '??') {
            country = match[1].toUpperCase();
            console.log(`      ✅ Country resolved from Tor: ${country}`);
          } else {
            console.log(`      ⚠️ Tor GeoIP unavailable, trying fallback API...`);
            // Fallback: Use external GeoIP API
            country = await this.getCountryFromAPI(ip);
          }
        } catch (error: any) {
          console.log(`      ❌ Tor GeoIP query failed: ${error.message}`);
          console.log(`      🔄 Trying fallback GeoIP API...`);
          // Fallback: Use external GeoIP API
          country = await this.getCountryFromAPI(ip);
        }
      } else {
        console.log(`      ⚠️ Invalid IP format: ${ip}`);
      }

      return { nickname, ip, country };
    } catch (error) {
      console.error(`Failed to get node info for ${fingerprint}:`, error);
      return { nickname: 'Unknown' };
    }
  }

  /**
   * Fallback GeoIP lookup using external API
   */
  private async getCountryFromAPI(ip: string): Promise<string | undefined> {
    try {
      const response = await fetch(`http://ip-api.com/json/${ip}?fields=countryCode`);
      const data = await response.json();
      if (data.countryCode) {
        console.log(`      ✅ Country resolved from API: ${data.countryCode}`);
        return data.countryCode;
      }
    } catch (error: any) {
      console.log(`      ❌ Fallback GeoIP API failed: ${error.message}`);
    }
    return undefined;
  }

  /**
   * Request a new Tor circuit (NEWNYM signal)
   */
  async requestNewCircuit(): Promise<boolean> {
    try {
      if (!this.authenticated) {
        const connected = await this.connectTorControl();
        if (!connected) return false;

        try {
          await this.sendTorCommand('AUTHENTICATE ""');
          this.authenticated = true;
        } catch (error) {
          console.error('Tor authentication failed:', error);
          return false;
        }
      }

      await this.sendTorCommand('SIGNAL NEWNYM');
      console.log('✅ Requested new Tor circuit (NEWNYM)');

      // Wait for circuit to establish
      await new Promise(resolve => setTimeout(resolve, 3000));

      return true;
    } catch (error) {
      console.error('Failed to request new circuit:', error);
      return false;
    }
  }
}

export const torIntegration = new TorIntegration();

// Cache for exit IP to avoid hammering Tor control port
let cachedExitIP: string | null = null;
let cacheExpiry = 0;
let isRefreshing = false;
const CACHE_TTL = 30000; // 30 seconds

/**
 * Get current Tor exit IP from circuit info (matches circuit display)
 * Uses caching to avoid control port timeout issues
 */
export async function getTorIP(): Promise<string> {
  const now = Date.now();

  // Return cached IP if still valid
  if (cachedExitIP && cacheExpiry > now) {
    return cachedExitIP;
  }

  // Prevent concurrent refresh attempts
  if (isRefreshing) {
    return cachedExitIP || 'tor-cached';
  }

  isRefreshing = true;

  try {
    // Get exit IP directly from current circuit
    const circuitInfo = await torIntegration.getCircuitInfo();
    if (circuitInfo?.hops.exit?.ip) {
      cachedExitIP = circuitInfo.hops.exit.ip;
      cacheExpiry = now + CACHE_TTL;
      return cachedExitIP;
    }
    // Fallback: return anonymous placeholder
    return cachedExitIP || `tor-${Math.random().toString(36).substring(2, 8)}`;
  } catch {
    // Silently fallback
    return cachedExitIP || `tor-${Math.random().toString(36).substring(2, 8)}`;
  } finally {
    isRefreshing = false;
  }
}

/**
 * Generate a cryptographically random anonymous ID
 */
export function generateAnonymousId(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
}
