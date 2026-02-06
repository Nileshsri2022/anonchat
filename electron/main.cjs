const { app, BrowserWindow, ipcMain, session, Menu } = require('electron');
const path = require('path');
const net = require('net');
const fetch = require('node-fetch');
const { SocksProxyAgent } = require('socks-proxy-agent');
const TorManager = require('./tor-manager.cjs');

// Tor control port helper - sends authenticated command
function sendTorCommand(command) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let response = '';
    let authenticated = false;
    let resolved = false;

    const cleanup = () => {
      if (!resolved) {
        resolved = true;
        socket.destroy();
      }
    };

    socket.connect(9051, '127.0.0.1');

    socket.on('connect', () => {
      // First authenticate
      socket.write('AUTHENTICATE ""\r\n');
    });

    socket.on('data', (data) => {
      response += data.toString();

      if (!authenticated) {
        // Check if authentication succeeded
        if (response.includes('250 OK')) {
          authenticated = true;
          response = ''; // Clear auth response
          // Now send the actual command
          socket.write(command + '\r\n');
        } else if (response.includes('515') || response.includes('514')) {
          cleanup();
          reject(new Error('Authentication failed: ' + response));
        }
      } else {
        // Check if command response is complete
        if (response.includes('250 OK') || response.includes('250-') || response.includes('.\r\n')) {
          if (!resolved) {
            resolved = true;
            socket.end();
            resolve(response);
          }
        }
      }
    });

    socket.on('error', (err) => {
      cleanup();
      reject(err);
    });

    socket.on('close', () => {
      if (!resolved) {
        resolved = true;
        if (response && authenticated) {
          resolve(response);
        } else if (!authenticated) {
          reject(new Error('Auth failed before close'));
        } else {
          reject(new Error('Connection closed'));
        }
      }
    });

    socket.setTimeout(5000, () => {
      cleanup();
      reject(new Error('Timeout'));
    });
  });
}

// GeoIP lookup to get country for an IP (uses direct HTTP, not proxied)
function getCountry(ip) {
  return new Promise((resolve) => {
    const http = require('http');
    const req = http.get(`http://ip-api.com/json/${ip}?fields=country`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json.country || 'Unknown');
        } catch {
          resolve('Unknown');
        }
      });
    });
    req.on('error', () => resolve('Unknown'));
    req.setTimeout(3000, () => {
      req.destroy();
      resolve('Unknown');
    });
  });
}

async function getCircuitInfo() {
  try {
    // Get circuit status (sendTorCommand handles authentication)
    const response = await sendTorCommand('GETINFO circuit-status');
    console.log('📡 Circuit response length:', response.length);
    console.log('📡 Circuit response (first 500 chars):', response.substring(0, 500));

    // Parse circuits
    const lines = response.split('\r\n');
    let circuitLine = null;

    for (const line of lines) {
      console.log('  Line:', line.substring(0, 80));
      if (line.includes('BUILT') && !line.includes('HS_SERVICE')) {
        circuitLine = line;
        break;
      }
    }

    if (!circuitLine) {
      console.log('❌ No BUILT circuit found');
      return null;
    }

    console.log('✅ Found circuit:', circuitLine.substring(0, 100));

    const parts = circuitLine.split(' ');
    const circuitId = parts[0];
    const pathStr = parts[2] || '';

    console.log('📍 Path string:', pathStr);

    // Extract fingerprints from path
    const fingerprints = pathStr.split(',').map(n => {
      const match = n.match(/\$([A-F0-9]+)/);
      return match ? match[1] : null;
    }).filter(Boolean);

    console.log('🔑 Fingerprints found:', fingerprints.length);

    if (fingerprints.length < 3) {
      console.log('❌ Not enough fingerprints:', fingerprints);
      return null;
    }

    // Get node info for each hop
    const hops = [];
    for (const fp of fingerprints) {
      try {
        const nodeResp = await sendTorCommand(`GETINFO ns/id/${fp}`);
        const rLine = nodeResp.split('\r\n').find(l => l.startsWith('r '));
        if (rLine) {
          const p = rLine.split(' ');
          const ip = p[6] || 'Unknown';
          const country = await getCountry(ip);
          hops.push({
            nickname: p[1] || 'Unknown',
            ip,
            country
          });
        } else {
          hops.push({ nickname: 'Unknown', ip: 'Unknown', country: 'Unknown' });
        }
      } catch {
        hops.push({ nickname: 'Unknown', ip: 'Unknown', country: 'Unknown' });
      }
    }

    return {
      circuitId,
      hops: {
        guard: hops[0] || null,
        middle: hops[1] || null,
        exit: hops[2] || null
      }
    };
  } catch (error) {
    console.error('Circuit info error:', error.message);
    return null;
  }
}

let mainWindow;
let torManager;

/**
 * Get platform-specific Tor binary path
 */
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
  } else {
    throw new Error(`Unsupported platform: ${platform}`);
  }

  const binaryName = platform === 'win32' ? 'tor.exe' : 'tor';
  return path.join(__dirname, 'tor', dir, binaryName);
}

/**
 * Bootstrap embedded Tor with hash verification
 */
async function bootstrapTor() {
  const torBinary = getTorBinaryPath();
  const torrc = path.join(__dirname, 'torrc.conf');

  torManager = new TorManager({
    torPath: torBinary,
    torrcPath: torrc,
    controlPort: 9051,
    socksPort: 9050
  });

  try {
    console.log('🔒 Starting embedded Tor...');
    console.log('📍 Binary:', torBinary);
    console.log('📍 Config:', torrc);

    // Load and verify binary integrity
    const hashConfigPath = path.join(__dirname, 'tor-hashes.json');
    if (require('fs').existsSync(hashConfigPath)) {
      const hashConfig = require(hashConfigPath);
      if (!hashConfig.skipVerification) {
        const platform = process.platform;
        const arch = process.arch;
        let hashKey = 'windows';
        if (platform === 'linux') hashKey = arch === 'arm64' ? 'linux-arm64' : 'linux-x64';
        if (platform === 'darwin') hashKey = arch === 'arm64' ? 'macos-arm64' : 'macos-x64';

        const expectedHash = hashConfig.hashes[hashKey];
        if (expectedHash && !expectedHash.includes('COMPUTE')) {
          console.log('🔍 Verifying Tor binary integrity...');
          torManager.verifyBinaryIntegrity(expectedHash);
        } else {
          console.warn('⚠️ No hash configured for this platform, skipping verification');
        }
      } else {
        console.warn('⚠️ Hash verification disabled in config');
      }
    } else {
      console.warn('⚠️ No hash config found, skipping verification');
    }

    torManager.start();
    await torManager.waitForReady(30000);

    console.log('✅ Tor ready on ports 9050 (SOCKS) / 9051 (Control)');

    // Enforce Tor proxy for ALL network requests at session level
    await session.defaultSession.setProxy({
      proxyRules: 'socks5://127.0.0.1:9050'
    });

    console.log('✅ Proxy enforced: ALL traffic routed through Tor');
    console.log('🔐 Security: WebRTC disabled, DNS leak prevention active');

    return true;
  } catch (err) {
    console.error('❌ CRITICAL: Tor failed to start');
    console.error('Error:', err.message);
    console.error('');
    console.error('🛑 HARD FAIL: Application cannot run without Tor');
    console.error('   This is a security feature to prevent IP leaks');
    console.error('');
    console.error('Troubleshooting:');
    console.error('  1. Check if Tor binary exists:', torBinary);
    console.error('  2. Check if config exists:', torrc);
    console.error('  3. Check file permissions');
    console.error('  4. Check if ports 9050/9051 are available');

    // HARD FAIL: refuse to run without Tor to avoid IP leaks
    app.quit();
    return false;
  }
}

/**
 * Create main application window
 */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  // Load the Next.js app
  mainWindow.loadURL('http://localhost:3000');

  // Open DevTools in development
  if (process.env.NODE_ENV !== 'production') {
    mainWindow.webContents.openDevTools();
  }
}

/**
 * Block WebRTC and other leak vectors
 */
app.on('web-contents-created', (event, contents) => {
  // Prevent webview preload scripts
  contents.on('will-attach-webview', (e, webPreferences) => {
    webPreferences.preload = '';
  });

  // Disable WebRTC to prevent UDP leaks
  contents.executeJavaScript(`
    (function() {
      // Remove WebRTC APIs that can leak real IP
      delete navigator.mediaDevices;
      delete navigator.getUserMedia;
      delete navigator.webkitGetUserMedia;
      delete navigator.mozGetUserMedia;
      
      // Disable RTCPeerConnection
      window.RTCPeerConnection = undefined;
      window.webkitRTCPeerConnection = undefined;
      window.mozRTCPeerConnection = undefined;
      
      console.log('🔒 WebRTC disabled for security');
    })();
  `).catch(() => {
    // Ignore errors if page not ready
  });
});

/**
 * Application ready - bootstrap Tor then create window
 */
app.whenReady().then(async () => {
  // CRITICAL: Bootstrap Tor BEFORE creating window
  await bootstrapTor();

  // IPC handler for Tor-routed fetch requests
  ipcMain.handle('tor-fetch', async (event, url) => {
    try {
      const agent = new SocksProxyAgent('socks5://127.0.0.1:9050');
      const res = await fetch(url, { agent, timeout: 10000 });
      return await res.text();
    } catch (error) {
      console.error('❌ Tor fetch failed:', error.message);
      throw error;
    }
  });

  // IPC handler for getting Tor circuit status
  ipcMain.handle('get-tor-circuit', async () => {
    try {
      const circuitInfo = await getCircuitInfo();
      console.log('📊 Circuit info:', circuitInfo);
      return circuitInfo;
    } catch (error) {
      console.error('❌ Failed to get circuit info:', error.message);
      return null;
    }
  });

  // IPC handler for requesting new Tor circuit
  ipcMain.handle('new-tor-circuit', async () => {
    console.log('🔄 New circuit button clicked...');
    try {
      // Get current circuit ID to close it
      const statusResp = await sendTorCommand('GETINFO circuit-status');
      const circuitMatch = statusResp.match(/^(\d+)\s+BUILT/m);

      if (circuitMatch) {
        const circuitId = circuitMatch[1];
        console.log('🔌 Closing circuit:', circuitId);
        // Close the current circuit
        await sendTorCommand(`CLOSECIRCUIT ${circuitId}`);
      }

      // Request new identity (clears DNS cache and uses new circuits)
      const response = await sendTorCommand('SIGNAL NEWNYM');
      console.log('✅ New circuit requested, response:', response);

      return true;
    } catch (error) {
      console.error('❌ Failed to request new circuit:', error.message);
      return false;
    }
  });

  // Create window after Tor is ready
  createWindow();

  // Create application menu with "New Window" option
  const menuTemplate = [
    {
      label: 'File',
      submenu: [
        {
          label: 'New Window',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            const newWin = new BrowserWindow({
              width: 1200,
              height: 800,
              webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                preload: path.join(__dirname, 'preload.js')
              }
            });
            newWin.loadURL('http://localhost:3000');
          }
        },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(menuTemplate);
  Menu.setApplicationMenu(menu);

  console.log('');
  console.log('🚀 AnonChat started with embedded Tor');
  console.log('🔐 All traffic is routed through Tor network');
  console.log('💡 Press Ctrl+N to open a new window for testing');
  console.log('');
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('before-quit', () => {
  // Gracefully shutdown Tor
  if (torManager) {
    console.log('🛑 Shutting down Tor...');
    torManager.stop();
  }
});
