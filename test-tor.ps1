# Simple Tor Test Script
# This will show you exactly what's happening

Write-Host "`n=== SIMPLE TOR TEST ===" -ForegroundColor Cyan
Write-Host ""

# Test 1: Check port 9050
Write-Host "TEST 1: Is Tor listening on port 9050?" -ForegroundColor Yellow
$port9050 = netstat -ano | Select-String ":9050.*LISTENING"
if ($port9050) {
    Write-Host "✅ YES - Port 9050 is listening" -ForegroundColor Green
    Write-Host $port9050
} else {
    Write-Host "❌ NO - Port 9050 is NOT listening" -ForegroundColor Red
    Write-Host "   This means Tor is not running properly!" -ForegroundColor Red
}

Write-Host ""

# Test 2: Direct IP (no Tor)
Write-Host "TEST 2: Your direct IP (without Tor)..." -ForegroundColor Yellow
try {
    $directIP = curl.exe -s https://api.ipify.org
    Write-Host "Direct IP: $directIP" -ForegroundColor Green
} catch {
    Write-Host "Could not fetch direct IP" -ForegroundColor Red
    $directIP = "ERROR"
}

Write-Host ""

# Test 3: Tor IP
Write-Host "TEST 3: Your IP through Tor (via SOCKS proxy)..." -ForegroundColor Yellow
try {
    $torIP = curl.exe -s --socks5 127.0.0.1:9050 https://api.ipify.org
    Write-Host "Tor IP: $torIP" -ForegroundColor Green
} catch {
    Write-Host "Could not fetch Tor IP (Tor might not be running)" -ForegroundColor Red
    $torIP = "ERROR"
}

Write-Host ""
Write-Host "=== RESULTS ===" -ForegroundColor Cyan

if ($directIP -eq $torIP -and $directIP -ne "ERROR") {
    Write-Host ""
    Write-Host "⚠️  WARNING: Both IPs are the SAME ($directIP)" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "This means you have a SYSTEM-WIDE PROXY or VPN active!" -ForegroundColor Yellow
    Write-Host "All your traffic (including Tor) is going through: $directIP" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Common causes:" -ForegroundColor White
    Write-Host "  - VPN software (NordVPN, ExpressVPN, ProtonVPN, etc.)" -ForegroundColor Gray
    Write-Host "  - Proxy software (Shadowsocks, V2Ray, Clash, etc.)" -ForegroundColor Gray
    Write-Host "  - Corporate/School proxy" -ForegroundColor Gray
    Write-Host "  - Tor Browser running (using same Tor network)" -ForegroundColor Gray
    Write-Host ""
    Write-Host "To fix: Disable your VPN/proxy and test again" -ForegroundColor Cyan
} elseif ($directIP -ne $torIP -and $torIP -ne "ERROR") {
    Write-Host ""
    Write-Host "✅ SUCCESS! Tor is working correctly!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Direct IP: $directIP (your real IP)" -ForegroundColor White
    Write-Host "Tor IP:    $torIP (anonymous Tor exit)" -ForegroundColor White
    Write-Host ""
    Write-Host "Your Tor setup is working perfectly! 🎉" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "❌ ERROR: Could not complete tests" -ForegroundColor Red
    Write-Host "Make sure curl is installed and Tor is running" -ForegroundColor Red
}

Write-Host ""
Write-Host "Press Enter to exit..."
Read-Host
