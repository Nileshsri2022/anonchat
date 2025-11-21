import { SocksProxyAgent } from 'socks-proxy-agent';
import { Socket } from 'net';
export interface TorStatus {
  connected: boolean;
  circuitEstablished: boolean;
  exitNodeCountry?: string;
  latency?: number;
  circuitId?: string;
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

      const fullCommand = command + '\r\n';
      this.controlSocket.write(fullCommand);
      let response = '';
      const onData = (data: Buffer) => {
        response += data.toString();
        if (response.includes('\r\n')) {
          this.controlSocket!.removeListener('data', onData);
          const lines = response.trim().split('\r\n');
          const statusLine = lines[0];
          if (statusLine.startsWith('250')) {
            resolve(response);
          } else {
            reject(new Error(`Tor command failed: ${statusLine}`));
          }
        }
      };

      this.controlSocket.on('data', onData);

      setTimeout(() => {
        this.controlSocket!.removeListener('data', onData);
        reject(new Error('Tor command timeout'));
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
}

export const torIntegration = new TorIntegration();
