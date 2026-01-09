const { spawn } = require('child_process');
const net = require('net');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

class TorManager {
    constructor({ torPath, torrcPath, controlPort = 9051, socksPort = 9050 }) {
        this.torPath = torPath;
        this.torrcPath = torrcPath;
        this.controlPort = controlPort;
        this.socksPort = socksPort;
        this.proc = null;
    }

    /**
     * Verify Tor binary integrity using SHA256 hash
     * @param {string} expectedHash - Expected SHA256 hash of the binary
     */
    verifyBinaryIntegrity(expectedHash) {
        if (!expectedHash) {
            console.warn('⚠️ No hash provided for Tor binary verification');
            return;
        }

        try {
            const fileBuffer = fs.readFileSync(this.torPath);
            const hashSum = crypto.createHash('sha256');
            hashSum.update(fileBuffer);
            const hex = hashSum.digest('hex');

            if (hex !== expectedHash) {
                throw new Error(`Tor binary integrity check failed. Expected: ${expectedHash}, Got: ${hex}`);
            }

            console.log('✅ Tor binary integrity verified');
        } catch (error) {
            console.error('❌ Binary verification failed:', error.message);
            throw error;
        }
    }

    /**
     * Start the Tor process
     */
    start() {
        if (!fs.existsSync(this.torPath)) {
            throw new Error(`Tor binary not found: ${this.torPath}`);
        }

        if (!fs.existsSync(this.torrcPath)) {
            throw new Error(`Tor config not found: ${this.torrcPath}`);
        }

        console.log(`🔒 Starting Tor from: ${this.torPath}`);
        console.log(`📋 Using config: ${this.torrcPath}`);

        const args = ['-f', this.torrcPath];
        this.proc = spawn(this.torPath, args, {
            stdio: ['ignore', 'pipe', 'pipe'],
            cwd: path.dirname(this.torPath)
        });

        this.proc.stdout.on('data', (d) => {
            const msg = d.toString().trim();
            if (msg) console.log('[tor]', msg);
        });

        this.proc.stderr.on('data', (d) => {
            const msg = d.toString().trim();
            if (msg) console.error('[tor-err]', msg);
        });

        this.proc.on('exit', (code, signal) => {
            console.log(`Tor process exited with code ${code}, signal ${signal}`);
            this.proc = null;
        });

        this.proc.on('error', (err) => {
            console.error('Tor process error:', err);
            this.proc = null;
        });
    }

    /**
     * Stop the Tor process gracefully
     */
    stop() {
        if (this.proc) {
            console.log('🛑 Stopping Tor process...');
            this.proc.kill('SIGTERM');
            this.proc = null;
        }
    }

    /**
     * Wait for Tor to be ready (SOCKS port open)
     * @param {number} timeout - Timeout in milliseconds
     * @returns {Promise<boolean>}
     */
    async waitForReady(timeout = 30000) {
        const start = Date.now();
        let attempts = 0;

        while (Date.now() - start < timeout) {
            attempts++;

            if (await this._isPortOpen(this.socksPort)) {
                console.log(`✅ Tor SOCKS port ${this.socksPort} is open (took ${attempts} attempts)`);
                return true;
            }

            // Wait 300ms between attempts
            await new Promise((r) => setTimeout(r, 300));
        }

        throw new Error(`Tor SOCKS port ${this.socksPort} not open within ${timeout}ms timeout`);
    }

    /**
     * Check if a port is open
     * @param {number} port - Port number to check
     * @returns {Promise<boolean>}
     */
    _isPortOpen(port) {
        return new Promise((resolve) => {
            const s = new net.Socket();
            s.setTimeout(200);

            s.on('connect', function () {
                s.destroy();
                resolve(true);
            }).on('error', function () {
                resolve(false);
            }).on('timeout', function () {
                s.destroy();
                resolve(false);
            }).connect(port, '127.0.0.1');
        });
    }

    /**
     * Get current Tor process status
     * @returns {object}
     */
    getStatus() {
        return {
            running: this.proc !== null && !this.proc.killed,
            pid: this.proc?.pid || null,
            socksPort: this.socksPort,
            controlPort: this.controlPort
        };
    }
}

module.exports = TorManager;
