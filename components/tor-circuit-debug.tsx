'use client';

import { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';

export function TorCircuitDebug() {
  const [circuit, setCircuit] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchCircuit = async () => {
    if (!window.TorAPI) return;
    try {
      const data = await window.TorAPI.getTorCircuit();
      setCircuit(data);
    } catch (error) {
      console.error('Failed to fetch Tor circuit:', error);
      setCircuit('Error fetching circuit');
    }
  };

  const newCircuit = async () => {
    if (!window.TorAPI) return;
    setLoading(true);
    try {
      await window.TorAPI.newTorCircuit();
      // Wait a bit for new circuit
      setTimeout(fetchCircuit, 2000);
    } catch (error) {
      console.error('Failed to create new Tor circuit:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCircuit();
    // Refresh every 30 seconds
    const interval = setInterval(fetchCircuit, 30000);
    return () => clearInterval(interval);
  }, []);

  // Show different content based on environment
  const isElectron = typeof window !== 'undefined' && window.TorAPI;

  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle className="text-sm">Tor Circuit Debug</CardTitle>
      </CardHeader>
      <CardContent>
        {isElectron ? (
          <>
            <div className="text-xs mb-2">
              {circuit ? (
                <div className="space-y-1">
                  {circuit.split('\n').filter(line => line.trim()).map((line, index) => {
                    const parts = line.trim().split(' ');
                    const circuitId = parts[0];
                    const status = parts[1];
                    const path = parts.slice(2).join(' ');
                    const nodes = path.split(',').map(node => {
                      const [fp, addr] = node.split('=');
                      const [ip, port] = addr ? addr.split(':') : ['', ''];
                      return { fingerprint: fp.replace('$', ''), ip, port };
                    });
                    return (
                      <div key={index} className="border rounded p-2 bg-gray-50 font-mono">
                        <div className="font-semibold">Circuit {circuitId}: {status}</div>
                        {nodes.map((node, i) => (
                          <div key={i} className="text-xs ml-2">
                            {i === 0 ? 'Guard' : i === nodes.length - 1 ? 'Exit' : 'Middle'}: {node.fingerprint} ({node.ip}:{node.port})
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              ) : 'Loading...'}
            </div>
            <Button onClick={newCircuit} disabled={loading} size="sm">
              {loading ? 'Creating...' : 'New Circuit'}
            </Button>
          </>
        ) : (
          <div className="text-xs text-muted-foreground">
            Tor Debug: Available only in Electron environment
          </div>
        )}
      </CardContent>
    </Card>
  );
}
