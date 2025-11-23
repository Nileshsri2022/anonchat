const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fetch = require('node-fetch');
const { SocksProxyAgent } = require('socks-proxy-agent');
const TorControl = require('tor-control');

let torControl;

// Try to connect to existing Tor control port
async function connectToTor() {
  try {
    console.log('🔌 Attempting to connect to Tor control port 9051...');
    torControl = new TorControl({
      host: '127.0.0.1',
      port: 9051,
      password: '' // Empty password for local Tor without authentication
    });

    await torControl.connect();
    console.log('✅ Connected to Tor control port successfully');

    // Test the connection
    try {
      const info = await torControl.getInfo('version');
      console.log('📋 Tor version:', info);
    } catch (err) {
      console.log('⚠️ Connected but authentication may be required');
    }

    return true;
  } catch (error) {
    console.error('❌ Failed to connect to Tor control port:', error.message);
    console.log('💡 Make sure Tor is running with ControlPort 9051 enabled');
    torControl = null;
    return false;
  }
}

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  // Load the Next.js app (assuming dev server is running on localhost:3000)
  mainWindow.loadURL('http://localhost:3000');

  // Open DevTools in development
  mainWindow.webContents.openDevTools();
}

app.whenReady().then(async () => {
  ipcMain.handle('tor-fetch', async (event, url) => {
    try {
      const agent = new SocksProxyAgent('socks5://127.0.0.1:9050');
      const res = await fetch(url, { agent });
      return await res.text();
    } catch (error) {
      console.error('❌ Tor fetch failed:', error.message);
      throw error;
    }
  });

  ipcMain.handle('get-tor-circuit', async () => {
    if (torControl) {
      try {
        const circuitStatus = await torControl.getInfo('circuit-status');
        console.log('🔄 Circuit status retrieved:', circuitStatus);
        return circuitStatus;
      } catch (error) {
        console.error('❌ Failed to get circuit status:', error.message);
        return null;
      }
    }
    console.log('⚠️ Tor control not connected');
    return null;
  });

  ipcMain.handle('new-tor-circuit', async () => {
    if (torControl) {
      try {
        await torControl.signal('NEWNYM');
        console.log('✅ New circuit requested (NEWNYM signal sent)');
        return true;
      } catch (error) {
        console.error('❌ Failed to request new circuit:', error.message);
        return false;
      }
    }
    console.log('⚠️ Tor control not connected');
    return false;
  });

  // Connect to existing Tor instance instead of starting our own
  await connectToTor();

  createWindow();


  // Wait for Tor to bootstrap and check IP
  setTimeout(async () => {
    console.log('🔍 Verifying Tor connection...');
    try {
      const agent = new SocksProxyAgent('socks5://127.0.0.1:9050');
      const response = await fetch('https://check.torproject.org/api/ip', {
        agent,
        timeout: 10000
      });
      const data = await response.json();
      console.log('✅ Tor Exit IP:', data.IP);
      console.log('🌐 Using Tor:', data.IsTor);
    } catch (error) {
      console.error('❌ Failed to fetch IP via Tor:', error.message);
      console.log('💡 Make sure Tor is running on SOCKS port 9050');
    }

    // Get circuit information
    if (torControl) {
      try {
        const circuits = await torControl.getInfo('circuit-status');
        console.log('🔄 Tor Circuit Status:');
        console.log(circuits);
      } catch (error) {
        console.error('❌ Failed to get Tor circuit status:', error.message);
      }
    }
  }, 3000);
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
  // Disconnect from Tor control port
  if (torControl) {
    try {
      torControl.disconnect();
      console.log('🔌 Disconnected from Tor control port');
    } catch (error) {
      console.error('Error disconnecting from Tor:', error.message);
    }
  }
});

