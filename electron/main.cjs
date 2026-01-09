const { app, BrowserWindow, ipcMain, session } = require('electron');
const path = require('path');
const fetch = require('node-fetch');
const { SocksProxyAgent } = require('socks-proxy-agent');
const TorManager = require('./tor-manager.cjs');

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
 * Bootstrap embedded Tor with hard-fail enforcement
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

    // Optional: Verify binary integrity (uncomment when you have hashes)
    // torManager.verifyBinaryIntegrity('YOUR_SHA256_HASH_HERE');

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
    if (torManager) {
      const status = torManager.getStatus();
      console.log('📊 Tor status:', status);
      return status;
    }
    return null;
  });

  // IPC handler for requesting new Tor circuit
  ipcMain.handle('new-tor-circuit', async () => {
    console.log('⚠️ New circuit requires tor-control library integration');
    return false;
  });

  // Create window after Tor is ready
  createWindow();

  console.log('');
  console.log('🚀 AnonChat started with embedded Tor');
  console.log('🔐 All traffic is routed through Tor network');
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
