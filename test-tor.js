// Quick test script to verify Tor connection
const TorControl = require('tor-control');
const fetch = require('node-fetch');
const { SocksProxyAgent } = require('socks-proxy-agent');

async function testTorConnection() {
    console.log('=== Testing Tor Connection ===\n');

    // Test 1: SOCKS Proxy (port 9050)
    console.log('1️⃣ Testing SOCKS proxy on port 9050...');
    try {
        const agent = new SocksProxyAgent('socks5://127.0.0.1:9050');
        const response = await fetch('https://check.torproject.org/api/ip', {
            agent,
            timeout: 10000
        });
        const data = await response.json();
        console.log('   ✅ SOCKS proxy working');
        console.log('   📍 Exit IP:', data.IP);
        console.log('   🌐 Using Tor:', data.IsTor);
    } catch (error) {
        console.log('   ❌ SOCKS proxy failed:', error.message);
        console.log('   💡 Make sure Tor is running with SOCKSPort 9050\n');
        return false;
    }

    console.log('');

    // Test 2: Control Port (port 9051)
    console.log('2️⃣ Testing control port on 9051...');
    try {
        const torControl = new TorControl({
            host: '127.0.0.1',
            port: 9051,
            password: ''
        });

        await torControl.connect();
        console.log('   ✅ Control port connected');

        try {
            const version = await torControl.getInfo('version');
            console.log('   📋 Tor version:', version);

            const circuits = await torControl.getInfo('circuit-status');
            const circuitLines = circuits.split('\n').filter(l => l.trim());
            console.log('   🔄 Active circuits:', circuitLines.length);

            if (circuitLines.length > 0) {
                console.log('   📊 Sample circuit:', circuitLines[0].substring(0, 80) + '...');
            }
        } catch (err) {
            console.log('   ⚠️ Connected but some commands failed:', err.message);
        }

        torControl.disconnect();
    } catch (error) {
        console.log('   ❌ Control port failed:', error.message);
        console.log('   💡 Make sure Tor is running with ControlPort 9051');
        console.log('   💡 Check torrc has: ControlPort 9051 and CookieAuthentication 0\n');
        return false;
    }

    console.log('\n✅ All tests passed! Tor is ready for Electron.\n');
    return true;
}

testTorConnection().catch(console.error);
