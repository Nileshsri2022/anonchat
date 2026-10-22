#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const ELECTRON_DIR = path.join(ROOT_DIR, 'electron');
const HASHES_PATH = path.join(ELECTRON_DIR, 'tor-hashes.json');

const DEFAULT_TOR_VERSION = '15.0.26';
const TOR_VERSION = process.env.TOR_VERSION || DEFAULT_TOR_VERSION;
const TOR_BASE_URL = `https://dist.torproject.org/torbrowser/${TOR_VERSION}`;

const ALL_TARGETS = [
  {
    platform: 'win32',
    arch: 'x64',
    key: 'windows',
    dir: 'windows',
    filename: `tor-expert-bundle-windows-x86_64-${TOR_VERSION}.tar.gz`,
    binaryName: 'tor.exe',
    binarySubdir: '' // on windows main.cjs looks at electron/tor/windows/tor.exe
  },
  {
    platform: 'linux',
    arch: 'x64',
    key: 'linux-x64',
    dir: 'linux',
    filename: `tor-expert-bundle-linux-x86_64-${TOR_VERSION}.tar.gz`,
    binaryName: 'tor',
    binarySubdir: 'tor' // on linux main.cjs looks at electron/tor/linux/tor/tor
  },
  {
    platform: 'linux',
    arch: 'arm64',
    key: 'linux-arm64',
    dir: 'linux-arm64',
    filename: `tor-expert-bundle-linux-aarch64-${TOR_VERSION}.tar.gz`,
    binaryName: 'tor',
    binarySubdir: 'tor'
  },
  {
    platform: 'darwin',
    arch: 'x64',
    key: 'macos-x64',
    dir: 'macos',
    filename: `tor-expert-bundle-macos-x86_64-${TOR_VERSION}.tar.gz`,
    binaryName: 'tor',
    binarySubdir: 'tor'
  },
  {
    platform: 'darwin',
    arch: 'arm64',
    key: 'macos-arm64',
    dir: 'macos-arm64',
    filename: `tor-expert-bundle-macos-aarch64-${TOR_VERSION}.tar.gz`,
    binaryName: 'tor',
    binarySubdir: 'tor'
  }
];

function getSelectedTargets() {
  const args = process.argv.slice(2);
  const isAll = args.includes('--all') || process.env.DOWNLOAD_ALL === 'true';

  if (isAll) {
    return ALL_TARGETS;
  }

  const platformArg = args.find((a) => a.startsWith('--platform='));
  const targetPlatform = platformArg
    ? platformArg.split('=')[1].toLowerCase()
    : process.env.TARGET_PLATFORM || process.platform;

  const archArg = args.find((a) => a.startsWith('--arch='));
  const targetArch = archArg
    ? archArg.split('=')[1].toLowerCase()
    : process.env.TARGET_ARCH || process.arch;

  const matched = ALL_TARGETS.filter((t) => {
    return (
      t.platform === targetPlatform ||
      (targetPlatform === 'windows' && t.platform === 'win32') ||
      (targetPlatform === 'mac' && t.platform === 'darwin') ||
      (targetPlatform === 'macos' && t.platform === 'darwin')
    );
  });

  if (matched.length === 0) {
    throw new Error(`Unsupported platform request: ${targetPlatform}`);
  }

  if (archArg || process.env.TARGET_ARCH) {
    const exact = matched.find((m) => m.arch === targetArch);
    return exact ? [exact] : [matched[0]];
  }

  const currentArchMatch = matched.find((m) => m.arch === process.arch);
  return [currentArchMatch || matched[0]];
}

function computeFileHash(filePath) {
  const buffer = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

async function downloadFile(url, destPath) {
  console.log(`⬇️  Downloading: ${url}`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText} for ${url}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  fs.writeFileSync(destPath, Buffer.from(arrayBuffer));
  console.log(`💾 Downloaded ${(arrayBuffer.byteLength / (1024 * 1024)).toFixed(2)} MB`);
}

async function processTarget(target) {
  console.log(`\n────────────────────────────────────────`);
  console.log(`🎯 Processing: ${target.key} (${target.platform}-${target.arch})`);
  console.log(`────────────────────────────────────────`);

  const targetDir = path.join(ELECTRON_DIR, 'tor', target.dir);
  fs.mkdirSync(targetDir, { recursive: true });

  const tempTarPath = path.join(ROOT_DIR, `temp-tor-${target.key}-${Date.now()}.tar.gz`);
  const tempExtractDir = path.join(ROOT_DIR, `temp-tor-extract-${target.key}-${Date.now()}`);
  const downloadUrl = `${TOR_BASE_URL}/${target.filename}`;

  try {
    await downloadFile(downloadUrl, tempTarPath);

    fs.mkdirSync(tempExtractDir, { recursive: true });
    console.log(`📦 Extracting with tar...`);
    execSync(`tar -xzf "${tempTarPath}" -C "${tempExtractDir}"`);

    // Copy everything from extract directory into target directory
    fs.cpSync(tempExtractDir, targetDir, { recursive: true, force: true });

    // Ensure GeoIP data is also at root of targetDir
    const dataDir = path.join(targetDir, 'data');
    if (fs.existsSync(dataDir)) {
      for (const file of fs.readdirSync(dataDir)) {
        const src = path.join(dataDir, file);
        const dst = path.join(targetDir, file);
        if (!fs.existsSync(dst)) fs.copyFileSync(src, dst);
        const nestedDst = path.join(targetDir, 'tor', file);
        if (!fs.existsSync(nestedDst)) fs.copyFileSync(src, nestedDst);
      }
    }

    // Determine primary binary location
    let primaryBinaryPath;
    if (target.binarySubdir) {
      primaryBinaryPath = path.join(targetDir, target.binarySubdir, target.binaryName);
    } else {
      primaryBinaryPath = path.join(targetDir, target.binaryName);
      // If binary is currently inside tor/ (from tarball), copy it to targetDir
      const nestedBinary = path.join(targetDir, 'tor', target.binaryName);
      if (!fs.existsSync(primaryBinaryPath) && fs.existsSync(nestedBinary)) {
        fs.copyFileSync(nestedBinary, primaryBinaryPath);
      }
    }

    if (!fs.existsSync(primaryBinaryPath)) {
      throw new Error(`Binary not found at expected path: ${primaryBinaryPath}`);
    }

    // Set executable bit on non-Windows
    if (target.platform !== 'win32') {
      try {
        fs.chmodSync(primaryBinaryPath, 0o755);
      } catch (e) {
        // May fail on Windows host for unix permissions, ignore
      }
    }

    // Compute hash
    const binaryHash = computeFileHash(primaryBinaryPath);
    console.log(`🔑 SHA-256 for ${target.key}: ${binaryHash}`);

    if (fs.existsSync(HASHES_PATH)) {
      const hashesData = JSON.parse(fs.readFileSync(HASHES_PATH, 'utf8'));
      hashesData.hashes[target.key] = binaryHash;
      hashesData.lastUpdated = new Date().toISOString().split('T')[0];
      fs.writeFileSync(HASHES_PATH, JSON.stringify(hashesData, null, 4) + '\n', 'utf8');
      console.log(`📝 Updated tor-hashes.json for ${target.key}`);
    }

    console.log(`✅ ${target.key} ready at: ${primaryBinaryPath}`);
  } finally {
    try {
      if (fs.existsSync(tempTarPath)) fs.unlinkSync(tempTarPath);
      if (fs.existsSync(tempExtractDir)) fs.rmSync(tempExtractDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }
}

async function main() {
  console.log(`========================================`);
  console.log(`🔒 AnonChat Tor Daemon Downloader`);
  console.log(`   Version: ${TOR_VERSION}`);
  console.log(`========================================`);

  const targets = getSelectedTargets();
  console.log(`📋 Targets to fetch: ${targets.map((t) => t.key).join(', ')}`);

  for (const target of targets) {
    await processTarget(target);
  }

  console.log(`\n========================================`);
  console.log(`🎉 All requested Tor daemons downloaded and verified!`);
  console.log(`========================================\n`);
}

main().catch((err) => {
  console.error('\n❌ ERROR downloading Tor binary:', err.message);
  process.exit(1);
});
