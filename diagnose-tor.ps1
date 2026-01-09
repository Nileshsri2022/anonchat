# Quick Tor Diagnosis Script
Write-Host "=== TOR DIAGNOSIS ===" -ForegroundColor Cyan
Write-Host ""

# Check what's listening on port 9050
Write-Host "Checking port 9050..." -ForegroundColor Yellow
netstat -ano | findstr ":9050"

Write-Host ""
Write-Host "Checking Tor process..." -ForegroundColor Yellow
Get-Process -Name tor -ErrorAction SilentlyContinue | Format-Table Id, ProcessName, Path -AutoSize

Write-Host ""
Write-Host "Checking your current IP..." -ForegroundColor Yellow
$ip = (Invoke-RestMethod -Uri "https://api.ipify.org?format=json").ip
Write-Host "Current IP: $ip" -ForegroundColor Green

Write-Host ""
Write-Host "Checking network adapters..." -ForegroundColor Yellow
Get-NetAdapter | Where-Object {$_.Status -eq "Up"} | Format-Table Name, InterfaceDescription, Status -AutoSize

Write-Host ""
Write-Host "Checking for TAP adapters (VPN indicators)..." -ForegroundColor Yellow
Get-NetAdapter | Where-Object {$_.InterfaceDescription -like "*TAP*" -or $_.InterfaceDescription -like "*VPN*" -or $_.InterfaceDescription -like "*TUN*"} | Format-Table Name, InterfaceDescription, Status -AutoSize

Write-Host ""
Write-Host "Press Enter to continue..."
Read-Host
