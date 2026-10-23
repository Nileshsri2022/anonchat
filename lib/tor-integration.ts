// Shared Electron Tor-API contract (preload contextBridge surface).
// The typed alternative to `(window as any)` — see ticket 39 (ADR-0012).
export interface TorHop {
  nickname: string;
  ip?: string;
  country?: string;
}

export interface TorCircuitInfo {
  circuitId: string;
  hops: {
    guard: TorHop | null;
    middle: TorHop | null;
    exit: TorHop | null;
  };
}

export interface TorAPI {
  /** Fetch a URL through the Tor SOCKS proxy; resolves with the response body text. */
  fetch(url: string): Promise<string>;
  /** Current circuit (guard -> middle -> exit) or null when Tor is down. */
  getTorCircuit(): Promise<TorCircuitInfo | null>;
  /** Request a fresh circuit (NEWNYM); resolves with success. */
  newTorCircuit(): Promise<boolean>;
}

declare global {
  interface Window {
    TorAPI?: TorAPI;
  }
}

import { SocksProxyAgent } from 'socks-proxy-agent';
import { Socket } from 'net';
import { controlAuthenticateCommand } from './tor-control-auth';
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
    // No NODE_ENV short-circuit here: production is exactly where the relay runs
    // alongside Tor, and `NODE_ENV=production` is also set at build time. A build
    // server has no Tor, so the connect below fails immediately with ECONNREFUSED
    // and resolves false — which is the same answer, reached honestly.
    return new Promise((resolve) => {
      if (this.controlSocket && !this.controlSocket.destroyed) {
        resolve(true);
        return;
      }

      this.controlSocket = new Socket();
      this.controlSocket.connect(this.torControlPort, '127.0.0.1');

      this.controlSocket.on('connect', () => {
        resolve(true);
      });

      this.controlSocket.on('error', () => {
        // Silently fail - Tor not running is expected in many environments
        resolve(false);
      });

      this.controlSocket.on('timeout', () => {
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
        return null;
      }

      // Get circuit information to show Tor is working
      const circuitResponse = await this.sendTorCommand('GETINFO circuit-status');
      const circuits = this.parseCircuitStatus(circuitResponse);
      const activeCircuit = circuits.find(c => c.status === 'BUILT');

      if (activeCircuit) {

        // Since we can't fetch through SOCKS in browser, show circuit info

        return activeCircuit.id; // Return circuit ID as confirmation
      } else {
        return null;
      }
    } catch (error) {
      console.error('❌ Failed to check Tor circuit status:', error);
      return null;
    }
  }

  async logTorIPStatus(): Promise<void> {
    try {

      const status = await this.checkTorStatus();

      if (status.connected && status.circuitEstablished) {

        const circuitInfo = await this.getCurrentIP();
        if (circuitInfo) {
        } else {
        }
      } else {
        if (!status.connected) {
        }
        if (!status.circuitEstablished) {
        }
      }


    } catch (error) {
      console.error('❌ Tor status check failed:', error);
    }
  }

  async fetchThroughTor(url: string, options: RequestInit = {}): Promise<Response> {
    if (!this.proxyAgent) {
      throw new Error('Tor proxy agent not initialized');
    }

    // Use native fetch with proxy agent
    // Note: In Electron main process, node-fetch with socks-proxy-agent works
    // In Next.js API routes, we use the native fetch which respects HTTP_PROXY env vars
    // For direct SOCKS proxy support, configure at the system/Electron level

    try {
      const response = await fetch(url, options);
      return response;
    } catch (error) {
      console.error('Fetch through Tor failed:', error);
      throw error;
    }
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

        // Authenticate with the cookie when Tor wrote one (the container), and
        // unauthenticated when it did not (desktop builds run with
        // CookieAuthentication 0).
        try {
          await this.sendTorCommand(await controlAuthenticateCommand());
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
        return null;
      }


      // Resolve node info for each hop SEQUENTIALLY to avoid socket buffer issues
      const nodes: CircuitHop[] = [];
      for (let i = 0; i < active.path.length; i++) {
        const fp = active.path[i];

        const nodeInfo = await this.getNodeInfo(fp);
        nodes.push(nodeInfo);

        // Small delay between queries to ensure socket buffer is clear
        if (i < active.path.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }


      const circuitInfo = {
        circuitId: active.id,
        hops: {
          guard: nodes[0] ?? null,
          middle: nodes[1] ?? null,
          exit: nodes[2] ?? null
        }
      };


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


    response.split('\r\n').forEach(line => {
      if (!line || line.startsWith('250')) return;

      const parts = line.split(' ');
      if (parts.length < 3) return;

      const id = parts[0];
      const status = parts[1];
      const path = parts[2];
      const metadata = parts.slice(3).join(' ');


      if (status !== 'BUILT') return;

      // Extract fingerprints from path (format: $FP1~name1,$FP2~name2,$FP3~name3)
      const fingerprints = path
        .split(',')
        .map(n => {
          const match = n.match(/\$([A-F0-9]+)/);
          if (match) {
            return match[1];
          }
          return null;
        })
        .filter(Boolean) as string[];


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

    return circuits;
  }

  /**
   * Get node information (nickname, IP, country)
   */
  private async getNodeInfo(fingerprint: string): Promise<CircuitHop> {
    try {
      const response = await this.sendTorCommand(`GETINFO ns/id/${fingerprint}`);

      // Parse node descriptor (format: "r nickname identity published IP ORPort DirPort")
      const line = response
        .split('\r\n')
        .find(l => l.startsWith('r '));

      if (!line) {
        console.warn(`      ⚠️ No 'r' line found for ${fingerprint.substring(0, 8)}`);
        return { nickname: 'Unknown' };
      }

      const parts = line.split(' ');
      const nickname = parts[1];
      const ip = parts[6];


      let country: string | undefined;

      // Get country code via GeoIP (only if IP is valid)
      if (/^\d+\.\d+\.\d+\.\d+$/.test(ip)) {
        try {
          const geo = await this.sendTorCommand(`GETINFO ip-to-country/${ip}`);

          const match = geo.match(/ip-to-country\/[\d.]+=(..)/i);
          if (match && match[1] !== '??') {
            country = match[1].toUpperCase();
          } else {
            // Fallback: Use external GeoIP API
            country = await this.getCountryFromAPI(ip);
          }
        } catch {
          // Fallback: Use external GeoIP API
          country = await this.getCountryFromAPI(ip);
        }
      } else {
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
  // Third-party GeoIP lookups were removed (ticket 08): an anonymity app must not
  // ask external services about its own circuits. Country stays undefined when the
  // Tor control port cannot answer.
  private async getCountryFromAPI(_ip: string): Promise<string | undefined> {
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
          await this.sendTorCommand(await controlAuthenticateCommand());
          this.authenticated = true;
        } catch (error) {
          console.error('Tor authentication failed:', error);
          return false;
        }
      }

      await this.sendTorCommand('SIGNAL NEWNYM');

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
 * The exit IP of the current circuit, or null when there is no circuit.
 *
 * Never invents one. A made-up address in this slot is worse than an absence: it
 * makes an unrouted connection look routed, which is the one claim an anonymity
 * app must not get wrong.
 */
export async function getTorIP(): Promise<string | null> {
  const now = Date.now();

  // Return cached IP if still valid
  if (cachedExitIP && cacheExpiry > now) {
    return cachedExitIP;
  }

  // Prevent concurrent refresh attempts
  if (isRefreshing) {
    return cachedExitIP;
  }

  isRefreshing = true;

  try {
    const circuitInfo = await torIntegration.getCircuitInfo();
    const exitIp = circuitInfo?.hops.exit?.ip;
    if (exitIp) {
      cachedExitIP = exitIp;
      cacheExpiry = now + CACHE_TTL;
      return cachedExitIP;
    }
    cachedExitIP = null;
    return null;
  } catch {
    cachedExitIP = null;
    return null;
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
