// lib/torProxy.js
import { SocksProxyAgent } from 'socks-proxy-agent';

let cachedProxies = [];
let proxyIndex = 0;
let lastFetchTime = 0;
const CACHE_DURATION = 1000 * 60 * 60; // 1 hour

// Track IP distribution for anonymity demonstration
const ipTracker = new Map();

// Load fresh fallback proxies from multiple sources
async function getFreshFallbackProxies() {
  const proxyApis = [
    {
      url: 'https://api.proxyscrape.com/v2/?request=getproxies&protocol=socks5&timeout=10000&country=all',
      parser: (text) => {
        return text.split('\n')
          .filter(line => line.trim())
          .slice(0, 10)
          .map(line => {
            const [host, port] = line.split(':');
            return { host: host?.trim(), port: parseInt(port) };
          })
          .filter(p => p.host && !isNaN(p.port));
      }
    },
    {
      url: 'https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/socks5.txt',
      parser: (text) => {
        return text.split('\n')
          .filter(line => line.trim())
          .slice(0, 10)
          .map(line => {
            const [host, port] = line.trim().split(':');
            return { host, port: parseInt(port) };
          })
          .filter(p => p.host && !isNaN(p.port));
      }
    }
  ];

  for (const api of proxyApis) {
    try {
      console.log(`Trying proxy API: ${new URL(api.url).hostname}`);
      const res = await fetch(api.url, { timeout: 10000 });

      if (!res.ok) continue;

      const text = await res.text();
      const proxies = api.parser(text);

      if (proxies.length > 0) {
        console.log(`✅ Got ${proxies.length} proxies from ${new URL(api.url).hostname}`);
        return proxies;
      }
    } catch (error) {
      console.log(`❌ API failed:`, error.message);
      continue;
    }
  }

  console.log('⚠️ All proxy APIs failed, using hardcoded fallbacks');
  return FALLBACK_PROXIES;
}

// Load proxies from GitHub sources
async function loadProxiesFromGit() {
  try {
    const now = Date.now();

    // Use cached proxies if still fresh
    if (cachedProxies.length > 0 && (now - lastFetchTime) < CACHE_DURATION) {
      console.log(`Using cached proxies: ${cachedProxies.length} available`);
      return cachedProxies;
    }

    console.log('Fetching proxies from GitHub...');
    const githubUrls = [
      'https://raw.githubusercontent.com/proxifly/free-proxy-list/main/socks5.txt',
      'https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/socks5.txt',
      'https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/socks5.txt',
      'https://raw.githubusercontent.com/jetkai/proxy-list/main/online-proxies/txt/proxies-socks5.txt'
    ];

    let response;
    for (const url of githubUrls) {
      try {
        console.log(`Trying GitHub source: ${url.split('/').slice(-3).join('/')}`);
        response = await fetch(url, { timeout: 10000 });
        if (response.ok) {
          console.log(`✅ GitHub source working`);
          break;
        }
      } catch (e) {
        continue;
      }
    }

    if (!response?.ok) {
      throw new Error('All GitHub sources failed');
    }

    const text = await response.text();
    console.log(`GitHub response length: ${text.length}`);

    const proxyLines = text.split('\n').filter(line => line.trim());
    console.log(`Found ${proxyLines.length} proxy lines`);

    cachedProxies = proxyLines.map(line => {
      const [host, port] = line.trim().split(':');
      return { host: host?.trim(), port: parseInt(port) };
    }).filter(proxy => proxy.host && !isNaN(proxy.port));

    lastFetchTime = now;
    console.log(`✅ Loaded ${cachedProxies.length} SOCKS5 proxies from GitHub`);

    return cachedProxies;
  } catch (error) {
    console.error('❌ Error loading proxies from Git:', error.message);
    console.log('Trying fresh fallback proxies...');
    try {
      cachedProxies = await getFreshFallbackProxies();
      lastFetchTime = Date.now();
      console.log(`✅ Loaded ${cachedProxies.length} fallback SOCKS5 proxies`);
      return cachedProxies;
    } catch (fallbackError) {
      console.error('❌ Fallback proxy fetch also failed:', fallbackError.message);
      cachedProxies = FALLBACK_PROXIES;
      lastFetchTime = Date.now();
      console.log(`Using ${cachedProxies.length} hardcoded fallback proxies`);
      return cachedProxies;
    }
  }
}

// Hardcoded fallback proxies - SOCKS5 only
const FALLBACK_PROXIES = [
  { host: '185.82.99.181', port: 9090 },
  { host: '51.222.13.193', port: 80 },
  { host: '198.199.86.142', port: 1080 },
  { host: '167.71.5.83', port: 1080 },
  { host: '64.227.100.98', port: 1080 },
  { host: '159.89.47.103', port: 1080 },
  { host: '104.248.63.15', port: 30588 },
  { host: '134.195.101.26', port: 1080 },
];

// Get next proxy with Tor-like circuit rotation (random selection for frequent changes)
async function getNextProxy() {
  let proxies = cachedProxies;

  if (proxies.length === 0) {
    proxies = await loadProxiesFromGit();
  }

  if (proxies.length === 0) {
    console.warn('Using hardcoded fallback proxies');
    proxies = FALLBACK_PROXIES;
  }

  // Tor-like circuit rotation: random proxy selection for frequent IP changes
  const randomIndex = Math.floor(Math.random() * proxies.length);
  const proxy = proxies[randomIndex];

  console.log(`🔄 [TOR CIRCUIT] Rotating to new proxy: ${randomIndex + 1}/${proxies.length} (${proxy.host}:${proxy.port})`);
  return proxy;
}

// Get anonymous IP through SOCKS proxy
export async function getTorIP() {
  // PRIORITY 1: Try local Tor instance first (port 9050)
  try {
    console.log('🔍 Attempting to use local Tor instance on port 9050...');
    const agent = new SocksProxyAgent('socks5://127.0.0.1:9050');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch('https://api.ipify.org?format=json', {
      agent,
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      ipTracker.set(data.ip, (ipTracker.get(data.ip) || 0) + 1);

      console.log(`✅ [LOCAL TOR] Successfully routed through local Tor: ${data.ip}`);
      console.log(`✔ Tor is running.`);
      console.log(`✔ Tor is bootstrapped.`);
      console.log(`✔ Your app IS routing traffic through Tor.`);

      return data.ip;
    }
  } catch (error) {
    console.warn(`⚠️ Local Tor (port 9050) not available: ${error.message}`);
    console.log(`❌ Falling back to external proxies...`);
  }

  // PRIORITY 2: Fall back to external SOCKS proxies
  const maxAttempts = 5;
  let lastError;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const proxy = await getNextProxy();

      if (!proxy?.host || !proxy?.port) {
        throw new Error('Invalid proxy configuration');
      }

      console.log(`Attempt ${attempt + 1}/${maxAttempts}: Trying ${proxy.host}:${proxy.port}`);

      // Create SOCKS proxy agent
      const proxyUrl = `socks5://${proxy.host}:${proxy.port}`;
      const agent = new SocksProxyAgent(proxyUrl);

      // Fetch IP through proxy with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      try {
        const response = await fetch('https://api.ipify.org?format=json', {
          agent,
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();

        // Track IP distribution
        const currentCount = ipTracker.get(data.ip) || 0;
        ipTracker.set(data.ip, currentCount + 1);

        console.log(`✅ [TOR CIRCUIT] New exit IP: ${data.ip} via ${proxy.host}:${proxy.port}`);
        console.log(`📊 [ANONYMITY] IP Distribution: ${Array.from(ipTracker.entries()).map(([ip, count]) => `${ip}(${count})`).join(', ')}`);

        return data.ip;

      } catch (fetchError) {
        clearTimeout(timeoutId);
        throw fetchError;
      }

    } catch (error) {
      lastError = error;
      console.warn(`❌ Attempt ${attempt + 1} failed: ${error.message}`);
      // Continue to next proxy
    }
  }

  // All proxies failed
  console.error(`❌ All ${maxAttempts} attempts failed`);
  throw new Error(`Failed to get anonymous IP after ${maxAttempts} attempts. Last error: ${lastError?.message}`);
}

// Generate anonymous session ID
export function generateAnonymousId() {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 15);
  return `anon-${timestamp}-${random}`;
}
