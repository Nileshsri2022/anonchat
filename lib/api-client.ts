// API Client for AnonChat Relay Communication

declare global {
  interface Window {
    TorAPI: {
      fetch: typeof fetch;
      getTorCircuit: () => Promise<string | null>;
      newTorCircuit: () => Promise<boolean>;
    };
  }
}

const RELAY_API_BASE = process.env.NEXT_PUBLIC_RELAY_API_URL || 'http://localhost:8080';

// Use TorAPI.fetch for client-side requests if available
const torFetch = typeof window !== 'undefined' && window.TorAPI ? window.TorAPI.fetch : fetch;

export interface RelayMessage {
  recipient: string;
  payload: string;
  timestamp: number;
}

export interface RelayResponse {
  success: boolean;
  message?: string;
  error?: string;
}

export class RelayApiClient {
  private clientId: string;

  constructor(clientId: string) {
    this.clientId = clientId;
  }

  async sendMessage(recipient: string, payload: string): Promise<RelayResponse> {
    try {
      const response = await torFetch(`${RELAY_API_BASE}/v1/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Client-Id': this.clientId,
        },
        body: JSON.stringify({
          recipient,
          payload: btoa(payload),
        }),
      });

      if (!response.ok) {
        return {
          success: false,
          error: `HTTP ${response.status}`,
        };
      }

      const data = await response.json();
      return {
        success: true,
        ...data,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async pollMessages(): Promise<RelayMessage[]> {
    try {
      const response = await torFetch(`${RELAY_API_BASE}/v1/poll`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Client-Id': this.clientId,
        },
      });

      if (!response.ok) {
        console.error(`Poll failed: HTTP ${response.status}`);
        return [];
      }

      const data = await response.json();
      return Array.isArray(data) ? data : [];
    } catch (error) {
      console.error('Poll error:', error);
      return [];
    }
  }

  async getTorStatus(): Promise<boolean> {
    try {
      const response = await torFetch(`${RELAY_API_BASE}/v1/health`);
      return response.ok;
    } catch {
      return false;
    }
  }
}

export function createRelayClient(clientId: string): RelayApiClient {
  return new RelayApiClient(clientId);
}
