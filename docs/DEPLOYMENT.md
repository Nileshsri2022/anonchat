# AnonChat Electron App - Production Deployment Guide

## Overview

This guide covers deploying your Electron app for production distribution.

---

## 📋 Pre-Deployment Checklist

- [ ] App works locally (`npm run electron:dev`)
- [ ] All features tested
- [ ] Version number updated in `package.json`
- [ ] App icons created (optional but recommended)
- [ ] README updated

---

## 🚀 Step 1: Create a Release

### Option A: Using Git Tags (Recommended)

```bash
# 1. Make sure all changes are committed
git add .
git commit -m "Release v1.0.0"

# 2. Update version in package.json
# Change "version": "0.1.0" to "version": "1.0.0"

# 3. Create and push tag
git tag v1.0.0
git push origin master
git push origin v1.0.0
```

**Result:** GitHub Actions automatically builds for all platforms and creates a draft release.

### Option B: Manual Trigger

1. Go to: https://github.com/Nileshsri2022/anonchat/actions
2. Click "Build & Release"
3. Click "Run workflow"
4. Select branch and click "Run workflow"

---

## 📦 Step 2: Publish the Release

1. Go to: https://github.com/Nileshsri2022/anonchat/releases
2. Find your draft release (e.g., v1.0.0)
3. Click "Edit"
4. Add release notes:
   ```markdown
   ## What's New
   - Feature 1
   - Feature 2
   
   ## Bug Fixes
   - Fixed issue X
   
   ## Download
   - **Windows:** AnonChat-Setup.exe
   - **macOS:** AnonChat.dmg
   - **Linux:** AnonChat.AppImage
   ```
5. Click "Publish release" ✅

---

## 🌐 Step 3: Set Up Landing Page (GitHub Pages)

### Enable GitHub Pages

1. Go to repo Settings → Pages
2. Source: "Deploy from a branch"
3. Branch: `master` → `/docs`
4. Click Save

**Your site will be at:** `https://nileshsri2022.github.io/anonchat/`

### Custom Domain (Optional)

1. Buy a domain (Namecheap, Cloudflare, etc.)
2. Add CNAME record pointing to `nileshsri2022.github.io`
3. Create `docs/CNAME` file with your domain:
   ```
   anonchat.app
   ```
4. Enable HTTPS in Pages settings

---

## 🔄 Step 4: Add Auto-Updates

### Install electron-updater

```bash
npm install electron-updater
```

### Update electron/main.cjs

Add at the top:
```javascript
const { autoUpdater } = require('electron-updater');
```

Add after app is ready:
```javascript
app.whenReady().then(() => {
  // Check for updates
  autoUpdater.checkForUpdatesAndNotify();
  
  // ... rest of your code
});

// Auto-update events (optional logging)
autoUpdater.on('update-available', () => {
  console.log('Update available!');
});

autoUpdater.on('update-downloaded', () => {
  console.log('Update downloaded. Will install on restart.');
});
```

### How it works

1. App checks GitHub Releases for new versions
2. Downloads update in background
3. Installs on next app restart

---

## 🔐 Step 5: Code Signing (Recommended for Production)

### Why Sign?

| Without Signing | With Signing |
|-----------------|--------------|
| "Unknown publisher" warning | Trusted app |
| Windows SmartScreen blocks | Smooth install |
| macOS Gatekeeper blocks | One-click open |

### Windows Code Signing

1. **Get a certificate** (~$200/year):
   - DigiCert: https://www.digicert.com/signing/code-signing-certificates
   - Sectigo: https://sectigo.com/code-signing-certificate
   
2. **Add to GitHub Secrets:**
   - `CSC_LINK`: Base64-encoded .p12 certificate
   - `CSC_KEY_PASSWORD`: Certificate password

3. **Update workflow:**
   ```yaml
   - name: Build Electron
     env:
       CSC_LINK: ${{ secrets.CSC_LINK }}
       CSC_KEY_PASSWORD: ${{ secrets.CSC_KEY_PASSWORD }}
     run: npx electron-builder --win
   ```

### macOS Code Signing + Notarization

1. **Join Apple Developer Program** ($99/year):
   https://developer.apple.com/programs/

2. **Create certificates in Xcode:**
   - Developer ID Application
   - Developer ID Installer

3. **Add to GitHub Secrets:**
   - `CSC_LINK`: Base64 .p12 certificate
   - `CSC_KEY_PASSWORD`: Certificate password
   - `APPLE_ID`: Your Apple ID email
   - `APPLE_APP_SPECIFIC_PASSWORD`: App-specific password
   - `APPLE_TEAM_ID`: Your team ID

4. **Update package.json:**
   ```json
   "mac": {
     "hardenedRuntime": true,
     "gatekeeperAssess": false,
     "notarize": {
       "teamId": "YOUR_TEAM_ID"
     }
   }
   ```

---

## 📊 Step 6: Add Analytics & Error Tracking

### Sentry (Error Tracking - Free Tier)

1. Sign up: https://sentry.io
2. Create project → Electron
3. Install:
   ```bash
   npm install @sentry/electron
   ```
4. Add to main.cjs:
   ```javascript
   const Sentry = require('@sentry/electron');
   Sentry.init({ dsn: 'YOUR_SENTRY_DSN' });
   ```

### Plausible (Privacy-Friendly Analytics)

1. Sign up: https://plausible.io
2. Add script to your app or use their API

---

## 📱 Step 7: App Store Distribution (Optional)

### Microsoft Store

1. Create Microsoft Partner Center account
2. Package as MSIX (update electron-builder config)
3. Submit for review

### Mac App Store

1. Requires Apple Developer account
2. Additional entitlements needed
3. Submit via App Store Connect

### Snapcraft (Linux)

```bash
# Build snap package
npm run build:linux -- --linux snap

# Publish to Snap Store
snapcraft upload dist/*.snap
```

---

## 🔄 Release Workflow Summary

```
1. Code changes
       ↓
2. Update version in package.json
       ↓
3. Commit & push
       ↓
4. Create tag: git tag v1.0.0 && git push origin v1.0.0
       ↓
5. Wait for GitHub Actions (~5-10 min)
       ↓
6. Edit draft release, add notes
       ↓
7. Click "Publish release"
       ↓
8. Users get auto-update notification!
```

---

## 📁 File Structure for Distribution

```
Your Release Assets:
├── Windows
│   ├── AnonChat-Setup-1.0.0.exe      (Installer)
│   └── AnonChat-1.0.0-portable.exe   (Portable)
├── macOS
│   ├── AnonChat-1.0.0.dmg            (Disk image)
│   └── AnonChat-1.0.0-mac.zip        (Zip archive)
└── Linux
    └── AnonChat-1.0.0.AppImage       (Universal package)
```

---

## 🆘 Troubleshooting

### Build Fails on GitHub Actions

1. Check Actions tab for error logs
2. Common issues:
   - Missing dependencies
   - Code signing errors (disable for testing)
   - Memory limits (macOS builds are heavy)

### Users Get Security Warnings

1. **Windows:** Need code signing certificate
2. **macOS:** Need notarization
3. **Both:** Tell users to right-click → Open

### Auto-Update Not Working

1. Check `publish` settings in package.json
2. Verify GitHub token permissions
3. Test with `autoUpdater.checkForUpdates()`

---

## ✅ Production Checklist

- [ ] Version number correct
- [ ] All platforms build successfully
- [ ] Release notes written
- [ ] Landing page updated
- [ ] Auto-updates working
- [ ] Code signing configured (optional)
- [ ] Error tracking enabled (optional)
- [ ] Tested download links

---

## 🎉 You're Live!

Share your download links:
- **Direct:** https://github.com/Nileshsri2022/anonchat/releases/latest
- **Landing Page:** https://nileshsri2022.github.io/anonchat/

