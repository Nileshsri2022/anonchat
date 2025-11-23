const { spawn } = require('child_process');
const path = require('path');

function getTorBinaryPath() {
  const platform = process.platform;
  const arch = process.arch;

  let dir;
  if (platform === 'win32') {
    dir = 'windows';
  } else if (platform === 'linux') {
    dir = arch === 'arm64' ? 'linux-arm64' : 'linux-x64';
  } else if (platform === 'darwin') {
    dir = arch === 'arm64' ? 'macos-arm64' : 'macos-x64';
  } else {
    throw new Error(`Unsupported platform: ${platform}`);
  }

  const binaryName = platform === 'win32' ? 'tor.exe' : 'tor';
  return path.join(__dirname, 'tor', dir, binaryName);
}

function startTor() {
  const binaryPath = getTorBinaryPath();
  const torrcPath = path.join(__dirname, 'torrc');

  console.log(`Starting Tor with binary: ${binaryPath}`);
  console.log(`Using config: ${torrcPath}`);

  const torProcess = spawn(binaryPath, ['-f', torrcPath], {
    stdio: 'inherit',
    cwd: __dirname
  });

  torProcess.on('error', (error) => {
    console.error('Failed to start Tor process:', error);
  });

  torProcess.on('exit', (code, signal) => {
    console.log(`Tor process exited with code ${code} and signal ${signal}`);
  });

  return torProcess;
}

module.exports = { startTor };
