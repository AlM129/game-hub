// ==========================================
// DOWNLOADER ZIP CLEANUP TESTS
// ==========================================
// Verifies that temporary ZIP files created by the download pipeline
// are always deleted after the pipeline finishes, regardless of outcome:
//   - successful install
//   - checksum failure
//   - extraction failure
//   - cancellation
//
// Uses a local HTTP server to serve fake game ZIP payloads and a mock
// Electron app (temp userData dir) so the real downloader/verifier/
// installer/manager modules run through their actual code paths.

const { test, expect } = require('@playwright/test');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const AdmZip = require('adm-zip');

const { startDownload, cancelDownload, getActiveDownloads } = require('../src/downloader/manager');

const testTimeout = 30000;

// ==========================================
// HELPERS
// ==========================================

/**
 * Compute the SHA-256 checksum of a buffer.
 */
function sha256(buffer) {
    return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Create a valid ZIP buffer containing an index.html file.
 */
function createTestZip(gameId = 'test-game', content = '<html><body>Test Game</body></html>') {
    const zip = new AdmZip();
    zip.addFile(`${gameId}/index.html`, Buffer.from(content, 'utf8'));
    return zip.toBuffer();
}

/**
 * Create a mock Electron app object.
 * userData points to a fresh temp directory.
 */
function createMockApp() {
    const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'gamehub-test-userdata-'));
    return {
        getPath: (name) => {
            if (name === 'userData') return userData;
            throw new Error(`Unexpected getPath call: ${name}`);
        }
    };
}

/**
 * Scan os.tmpdir() for leftover gamehub temp ZIP files for a game.
 */
function findLeftoverZips(gameId) {
    const prefix = `gamehub-${gameId}-`;
    return fs.readdirSync(os.tmpdir()).filter(f => f.startsWith(prefix) && f.endsWith('.zip'));
}

/**
 * Wait for a condition to become true.
 */
async function waitFor(conditionFn, { timeout = 10000, interval = 50, message = 'Condition not met' } = {}) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
        if (conditionFn()) return;
        await new Promise(resolve => setTimeout(resolve, interval));
    }
    throw new Error(message);
}

/**
 * Start a local HTTP server serving a payload buffer.
 *
 * For cancellation tests, `chunkDelayMs` inserts a delay between chunks
 * so the download stays in progress long enough to be cancelled.
 *
 * The chunk stream stops as soon as the client disconnects (e.g. when a
 * download is cancelled), and close() force-closes any lingering
 * connections so the test never hangs.
 *
 * @returns {Promise<{ server: http.Server, url: string, close: () => Promise<void> }>}
 */
function startServer(payload, { chunkDelayMs = 0, chunkSize = 4096 } = {}) {
    return new Promise((resolve, reject) => {
        const server = http.createServer((req, res) => {
            res.writeHead(200, {
                'Content-Type': 'application/zip',
                'Content-Length': payload.length
            });

            if (chunkDelayMs > 0) {
                // Stream in delayed chunks to allow mid-download cancellation.
                // Stop sending as soon as the client disconnects or the
                // response errors, and clear pending timers so the process
                // and the server can shut down cleanly.
                let offset = 0;
                let timer = null;
                const stop = () => {
                    if (timer) {
                        clearTimeout(timer);
                        timer = null;
                    }
                };
                res.on('close', stop);
                res.on('error', stop);
                req.on('close', stop);

                const sendChunk = () => {
                    if (offset >= payload.length) {
                        res.end();
                        return;
                    }
                    const end = Math.min(offset + chunkSize, payload.length);
                    res.write(payload.subarray(offset, end), (err) => {
                        if (err) {
                            stop();
                            return;
                        }
                        offset = end;
                        timer = setTimeout(sendChunk, chunkDelayMs);
                    });
                };
                sendChunk();
            } else {
                res.end(payload);
            }
        });

        server.listen(0, '127.0.0.1', () => {
            const { port } = server.address();
            resolve({
                server,
                url: `http://127.0.0.1:${port}/game.zip`,
                close: () => new Promise(r => {
                    // Stop accepting new connections; force-close any existing
                    // ones so an aborted client download cannot block shutdown.
                    server.close(() => r());
                    if (typeof server.closeAllConnections === 'function') {
                        server.closeAllConnections();
                    }
                })
            });
        });

        server.on('error', reject);
    });
}

/**
 * Run a download to a terminal state and collect progress events.
 *
 * @returns {Promise<Array<Object>>} Progress events, resolving on completed/error
 */
function runDownloadToTerminal(app, gameId, metadata) {
    return new Promise((resolve, reject) => {
        const events = [];
        const timeout = setTimeout(() => {
            reject(new Error('Download did not reach a terminal state in time'));
        }, testTimeout);

        startDownload(app, gameId, metadata, (progress) => {
            events.push(progress);
            if (progress.status === 'completed' || progress.status === 'error') {
                clearTimeout(timeout);
                resolve(events);
            }
        });
    });
}

/**
 * Ensure no leftover temp ZIPs exist for a game before a test starts.
 */
function assertNoLeftoversBefore(gameId) {
    expect(findLeftoverZips(gameId), `Pre-existing leftover ZIPs for ${gameId}`).toHaveLength(0);
}

/**
 * Poll until no leftover temp ZIPs remain for a game.
 */
async function expectNoLeftoversAfter(gameId) {
    await waitFor(
        () => findLeftoverZips(gameId).length === 0,
        { message: `Temporary ZIP was not cleaned up for ${gameId}` }
    );
    expect(findLeftoverZips(gameId)).toHaveLength(0);
}

// ==========================================
// TESTS
// ==========================================

test.describe('Downloader ZIP Cleanup', () => {
    test.beforeEach(async ({}, testInfo) => {
        testInfo.setTimeout(testTimeout);
    });

    test('successful update cleans up temporary ZIP', async () => {
        const gameId = 'dl-success-game';
        assertNoLeftoversBefore(gameId);

        const zipBuffer = createTestZip(gameId, '<html><body>v1.0</body></html>');
        const server = await startServer(zipBuffer);
        const app = createMockApp();

        const metadata = {
            version: '1.0.0',
            channel: 'stable',
            download: {
                url: server.url,
                checksum: sha256(zipBuffer)
            }
        };

        try {
            const events = await runDownloadToTerminal(app, gameId, metadata);

            // Pipeline completed
            const completed = events.find(e => e.status === 'completed');
            expect(completed).toBeTruthy();
            expect(completed.path).toBe(path.join(app.getPath('userData'), 'games', gameId));

            // Game extracted to final install path
            const installIndex = path.join(app.getPath('userData'), 'games', gameId, 'index.html');
            expect(fs.existsSync(installIndex)).toBe(true);
            expect(fs.readFileSync(installIndex, 'utf8')).toContain('v1.0');

            // No staging directory left behind
            expect(fs.existsSync(installIndex + '.tmp')).toBe(false);

            // ZIP cleaned up centrally
            await expectNoLeftoversAfter(gameId);
        } finally {
            await server.close();
            fs.rmSync(app.getPath('userData'), { recursive: true, force: true });
        }
    });

    test('failed checksum cleans up temporary ZIP and does not install', async () => {
        const gameId = 'dl-checksum-game';
        assertNoLeftoversBefore(gameId);

        const zipBuffer = createTestZip(gameId, '<html><body>corrupt</body></html>');
        const server = await startServer(zipBuffer);
        const app = createMockApp();

        // Deliberately wrong checksum
        const metadata = {
            version: '1.0.0',
            channel: 'stable',
            download: {
                url: server.url,
                checksum: '0'.repeat(64)
            }
        };

        try {
            const events = await runDownloadToTerminal(app, gameId, metadata);

            const error = events.find(e => e.status === 'error');
            expect(error).toBeTruthy();
            expect(error.error).toContain('Checksum mismatch');

            // Game must not be installed
            expect(fs.existsSync(path.join(app.getPath('userData'), 'games', gameId))).toBe(false);

            // ZIP cleaned up centrally
            await expectNoLeftoversAfter(gameId);
        } finally {
            await server.close();
            fs.rmSync(app.getPath('userData'), { recursive: true, force: true });
        }
    });

    test('stable release missing checksum is rejected and existing install untouched', async () => {
        const gameId = 'dl-stable-no-checksum-game';
        assertNoLeftoversBefore(gameId);

        const zipBuffer = createTestZip(gameId, '<html><body>v2.0</body></html>');
        const server = await startServer(zipBuffer);
        const app = createMockApp();

        // Pre-seed an existing installation (simulates an installed stable
        // release being updated with a package that omits checksum metadata)
        const installPath = path.join(app.getPath('userData'), 'games', gameId);
        fs.mkdirSync(installPath, { recursive: true });
        fs.writeFileSync(path.join(installPath, 'index.html'), '<html><body>Existing v1.0</body></html>', 'utf8');

        // Stable channel with NO checksum in download metadata
        const metadata = {
            version: '2.0.0',
            channel: 'stable',
            download: {
                url: server.url
                // checksum intentionally omitted
            }
        };

        try {
            const events = await runDownloadToTerminal(app, gameId, metadata);

            const error = events.find(e => e.status === 'error');
            expect(error).toBeTruthy();
            expect(error.error).toContain('Checksum is required');

            // Existing installation remains intact
            const existingIndex = path.join(installPath, 'index.html');
            expect(fs.existsSync(existingIndex)).toBe(true);
            expect(fs.readFileSync(existingIndex, 'utf8')).toContain('Existing v1.0');

            // ZIP cleaned up centrally
            await expectNoLeftoversAfter(gameId);
        } finally {
            await server.close();
            fs.rmSync(app.getPath('userData'), { recursive: true, force: true });
        }
    });

    test('development release without checksum installs successfully', async () => {
        const gameId = 'dl-dev-no-checksum-game';
        assertNoLeftoversBefore(gameId);

        const zipBuffer = createTestZip(gameId, '<html><body>Dev Build</body></html>');
        const server = await startServer(zipBuffer);
        const app = createMockApp();

        // Development channel with NO checksum — must still install
        const metadata = {
            version: '0.9.0-dev',
            channel: 'development',
            download: {
                url: server.url
                // checksum intentionally omitted
            }
        };

        try {
            const events = await runDownloadToTerminal(app, gameId, metadata);

            // Pipeline completed
            const completed = events.find(e => e.status === 'completed');
            expect(completed).toBeTruthy();
            expect(completed.path).toBe(path.join(app.getPath('userData'), 'games', gameId));

            // Game extracted to final install path
            const installIndex = path.join(app.getPath('userData'), 'games', gameId, 'index.html');
            expect(fs.existsSync(installIndex)).toBe(true);
            expect(fs.readFileSync(installIndex, 'utf8')).toContain('Dev Build');

            // No staging directory left behind
            expect(fs.existsSync(installIndex + '.tmp')).toBe(false);

            // ZIP cleaned up centrally
            await expectNoLeftoversAfter(gameId);
        } finally {
            await server.close();
            fs.rmSync(app.getPath('userData'), { recursive: true, force: true });
        }
    });

    test('failed extraction cleans up temporary ZIP and preserves existing installation', async () => {
        const gameId = 'dl-extract-game';
        assertNoLeftoversBefore(gameId);

        // Serve a NON-zip buffer with a VALID checksum — passes verification,
        // fails in extractZip (invalid ZIP signature)
        const invalidZipBuffer = Buffer.from('this is definitely not a zip file', 'utf8');
        const server = await startServer(invalidZipBuffer);
        const app = createMockApp();

        // Pre-seed an existing installation (simulates an installed game being updated)
        const installPath = path.join(app.getPath('userData'), 'games', gameId);
        fs.mkdirSync(installPath, { recursive: true });
        fs.writeFileSync(path.join(installPath, 'index.html'), '<html><body>Existing v0.9</body></html>', 'utf8');

        const metadata = {
            version: '2.0.0',
            channel: 'stable',
            download: {
                url: server.url,
                checksum: sha256(invalidZipBuffer) // Valid checksum — passes verification
            }
        };

        try {
            const events = await runDownloadToTerminal(app, gameId, metadata);

            const error = events.find(e => e.status === 'error');
            expect(error).toBeTruthy();
            expect(error.error).toContain('Failed to extract ZIP');

            // Existing installation remains intact
            const existingIndex = path.join(installPath, 'index.html');
            expect(fs.existsSync(existingIndex)).toBe(true);
            expect(fs.readFileSync(existingIndex, 'utf8')).toContain('Existing v0.9');

            // Staging directory cleaned up by installer
            expect(fs.existsSync(installPath + '.tmp')).toBe(false);

            // ZIP cleaned up centrally
            await expectNoLeftoversAfter(gameId);
        } finally {
            await server.close();
            fs.rmSync(app.getPath('userData'), { recursive: true, force: true });
        }
    });

    test('cancelled download cleans up temporary ZIP', async () => {
        const gameId = 'dl-cancel-game';
        assertNoLeftoversBefore(gameId);

        // Large payload streamed slowly so we can cancel mid-download
        const bigPayload = crypto.randomBytes(1024 * 1024); // 1 MB
        const server = await startServer(bigPayload, { chunkDelayMs: 100, chunkSize: 16384 });
        const app = createMockApp();

        const metadata = {
            version: '1.0.0',
            channel: 'stable',
            download: {
                url: server.url,
                checksum: sha256(bigPayload)
            }
        };

        try {
            // Start the download in the background
            startDownload(app, gameId, metadata, () => {});

            // Wait for the download to start (temp file exists)
            await waitFor(
                () => findLeftoverZips(gameId).length > 0,
                { message: 'Download never created a temporary ZIP' }
            );

            // Cancel the download
            const active = getActiveDownloads();
            const entry = active.find(d => d.gameId === gameId);
            expect(entry, 'Active download entry should exist').toBeTruthy();

            const cancelled = cancelDownload(entry.downloadId);
            expect(cancelled).toBe(true);

            // Partial ZIP must be cleaned up
            await expectNoLeftoversAfter(gameId);

            // No game installed
            expect(fs.existsSync(path.join(app.getPath('userData'), 'games', gameId))).toBe(false);
        } finally {
            await server.close();
            fs.rmSync(app.getPath('userData'), { recursive: true, force: true });
        }
    });
});