@echo off
setlocal enabledelayedexpansion

set TOR_VERSION=0.4.8.12
set TB_VERSION=15.0.2

set BASE=https://dist.torproject.org

echo Creating tor bundle...
rmdir /s /q electron\tor >nul 2>&1
mkdir electron\tor
mkdir electron\tor\windows
mkdir electron\tor\linux-x64
mkdir electron\tor\linux-arm64

REM -------------------------------------------
REM 1. WINDOWS (Expert Bundle)
REM -------------------------------------------
echo Downloading Tor Expert Bundle for Windows...
curl -L "%BASE%/torbrowser/%TB_VERSION%/tor-expert-bundle-windows-x86_64-%TB_VERSION%.tar.gz" -o win.tar.gz
tar -xf win.tar.gz
xcopy /E /I /Y Tor electron\tor\windows
rmdir /s /q Tor
del win.tar.gz

REM -------------------------------------------
REM 2. LINUX x86_64
REM -------------------------------------------
echo Downloading Tor Linux x64...
curl -L "%BASE%/tor-%TOR_VERSION%/tor-%TOR_VERSION%-linux-x86_64.tar.gz" -o lin.tar.gz
tar -xf lin.tar.gz
copy tor-%TOR_VERSION%-linux-x86_64\bin\tor electron\tor\linux-x64
rmdir /s /q tor-%TOR_VERSION%-linux-x86_64
del lin.tar.gz

REM -------------------------------------------
REM 3. LINUX ARM64
REM -------------------------------------------
echo Downloading Tor Linux ARM64...
curl -L "%BASE%/tor-%TOR_VERSION%/tor-%TOR_VERSION%-linux-arm64.tar.gz" -o linarm.tar.gz
tar -xf linarm.tar.gz
copy tor-%TOR_VERSION%-linux-arm64\bin\tor electron\tor\linux-arm64
rmdir /s /q tor-%TOR_VERSION%-linux-arm64
del linarm.tar.gz

REM -------------------------------------------
REM torrc file
REM -------------------------------------------
echo Creating torrc...
(
echo SOCKSPort 9050
echo ControlPort 9051
echo CookieAuthentication 1
echo DataDirectory ./tor-data
echo ClientOnly 1
) > torrc

copy torrc electron\tor\windows\
copy torrc electron\tor\linux-x64\
copy torrc electron\tor\linux-arm64\
del torrc

echo.
echo DONE!
echo Tor bundle created at: electron\tor\
