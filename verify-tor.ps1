# Tor Verification Script
# Run this to check if Tor is working correctly

Write-Host "`n=== TOR VERIFICATION SCRIPT ===" -ForegroundColor Cyan
Write-Host ""

# 1. Check your real IP (without Tor)
Write-Host "1. Checking your REAL IP (direct connection)..." -ForegroundColor Yellow
try {
    $realIP = (Invoke-RestMethod -Uri "https://api.ipify.org?format=json").ip
    Write-Host "   Your Real IP: $realIP" -ForegroundColor Green
} catch {
    Write-Host "   Error: Could not fetch real IP" -ForegroundColor Red
}

Write-Host ""

# 2. Check if Tor process is running
Write-Host "2. Checking if Tor process is running..." -ForegroundColor Yellow
$torProcess = Get-Process -Name "tor" -ErrorAction SilentlyContinue
if ($torProcess) {
    Write-Host "   ✅ Tor process found (PID: $($torProcess.Id))" -ForegroundColor Green
} else {
    Write-Host "   ❌ Tor process NOT running" -ForegroundColor Red
}

Write-Host ""

# 3. Check if port 9050 is listening
Write-Host "3. Checking if Tor SOCKS port 9050 is listening..." -ForegroundColor Yellow
$port9050 = Get-NetTCPConnection -LocalPort 9050 -ErrorAction SilentlyContinue
if ($port9050) {
    Write-Host "   ✅ Port 9050 is LISTENING" -ForegroundColor Green
    Write-Host "   Process ID: $($port9050.OwningProcess)" -ForegroundColor Gray
} else {
    Write-Host "   ❌ Port 9050 is NOT listening" -ForegroundColor Red
}

Write-Host ""

# 4. Check for VPN connections
Write-Host "4. Checking for active VPN connections..." -ForegroundColor Yellow
$vpn = Get-VpnConnection -ErrorAction SilentlyContinue | Where-Object {$_.ConnectionStatus -eq "Connected"}
if ($vpn) {
    Write-Host "   ⚠️  VPN FOUND: $($vpn.Name) (Status: $($vpn.ConnectionStatus))" -ForegroundColor Yellow
} else {
    Write-Host "   ✅ No active VPN connections" -ForegroundColor Green
}

Write-Host ""

# 5. Check Windows proxy settings
Write-Host "5. Checking Windows proxy settings..." -ForegroundColor Yellow
$proxy = Get-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings'
if ($proxy.ProxyEnable -eq 1) {
    Write-Host "   ⚠️  System proxy ENABLED: $($proxy.ProxyServer)" -ForegroundColor Yellow
} else {
    Write-Host "   ✅ No system proxy configured" -ForegroundColor Green
}

Write-Host ""

# 6. Summary
Write-Host "=== SUMMARY ===" -ForegroundColor Cyan
Write-Host ""

if ($realIP -eq "103.158.183.57") {
    Write-Host "⚠️  WARNING: Your real IP matches the Tor IP (103.158.183.57)" -ForegroundColor Yellow
    Write-Host "   This suggests you have a system-wide proxy/VPN active." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "   Possible causes:" -ForegroundColor White
    Write-Host "   - VPN software running in background" -ForegroundColor Gray
    Write-Host "   - System proxy configured" -ForegroundColor Gray
    Write-Host "   - ISP/network transparent proxy" -ForegroundColor Gray
    Write-Host "   - Tor Browser running (using same Tor network)" -ForegroundColor Gray
} else {
    Write-Host "✅ SUCCESS: Your real IP ($realIP) is DIFFERENT from Tor IP (103.158.183.57)" -ForegroundColor Green
    Write-Host "   This confirms Tor is providing anonymity!" -ForegroundColor Green
}

Write-Host ""
Write-Host "Press any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
