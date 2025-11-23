import { createRequire } from 'module';
import fetch from 'node-fetch';
import { SocksProxyAgent } from 'socks-proxy-agent';

const require = createRequire(import.meta.url);
const { ipcMain } = require('electron');

ipcMain.handle('tor-fetch', async (event, url) => {
  const agent = new SocksProxyAgent('socks5://127.0.0.1:9050');
  const res = await fetch(url, { agent });
  return await res.text();
});
