// ==========================================
// DOWNLOADER
// ==========================================
// Downloads ZIP packages from a URL to a temporary file.
// Supports progress tracking and cancellation via AbortSignal.
//
// Uses Node.js built-in http/https modules (not fetch) for
// reliable streaming and progress reporting.

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

/**
 * Download a file from a URL to a temporary location.
 *
 * @param {Object} options
 * @param {string} options.url - The download URL
 * @param {string} options.gameId - Game identifier (used for temp file naming)
 * @param {AbortSignal} [options.signal] - Optional AbortSignal for cancellation
 * @param {Function} [options.onProgress] - Progress callback: ({ bytes, total, percentage })
 * @returns {Promise<string>} Path to the downloaded temp file
 */
function download({ url, gameId, signal, onProgress }) {
    return new Promise((resolve, reject) => {
        // Validate URL
        if (!url || typeof url !== 'string') {
            return reject(new Error('Download URL is required'));
        }

        const parsedUrl = new URL(url);
        const isHttps = parsedUrl.protocol === 'https:';
        const transport = isHttps ? https : http;

        // Create a unique temp file path
        const timestamp = Date.now();
        const randomSuffix = crypto.randomBytes(4).toString('hex');
        const tempDir = os.tmpdir();
        const tempPath = path.join(tempDir, `gamehub-${gameId}-${timestamp}-${randomSuffix}.zip`);

        // Track cancellation
        if (signal && signal.aborted) {
            return reject(new Error('Download cancelled before start'));
        }

        const onAbort = () => {
            cleanup();
            reject(new Error('Download cancelled'));
        };

        if (signal) {
            signal.addEventListener('abort', onAbort, { once: true });
        }

        let cleanup = () => {
            if (signal) {
                signal.removeEventListener('abort', onAbort);
            }
            // Close file handle if open
            if (fileStream) {
                fileStream.destroy();
                fileStream = null;
            }
            // Remove partial file
            fs.unlink(tempPath, () => {});
        };

        let fileStream = null;

        try {
            const request = transport.get(parsedUrl, {
                headers: {
                    'User-Agent': 'GameHub/1.0'
                }
            }, (response) => {
                // Handle redirects
                if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                    cleanup();
                    const redirectUrl = new URL(response.headers.location, url).toString();
                    return resolve(download({ url: redirectUrl, gameId, signal, onProgress }));
                }

                // Check for HTTP errors
                if (response.statusCode < 200 || response.statusCode >= 300) {
                    cleanup();
                    return reject(new Error(`Download failed with HTTP status ${response.statusCode}`));
                }

                const total = parseInt(response.headers['content-length'] || '0', 10);
                let bytes = 0;
                let lastReport = Date.now();

                // Create write stream
                fileStream = fs.createWriteStream(tempPath);

                fileStream.on('error', (err) => {
                    cleanup();
                    reject(new Error(`Failed to write temp file: ${err.message}`));
                });

                // Pipe data with progress tracking
                response.on('data', (chunk) => {
                    bytes += chunk.length;

                    // Throttle progress reports to avoid flooding (every 100ms)
                    const now = Date.now();
                    if (onProgress && (now - lastReport >= 100 || bytes === total)) {
                        lastReport = now;
                        onProgress({
                            bytes,
                            total,
                            percentage: total > 0 ? Math.round((bytes / total) * 100) : 0
                        });
                    }
                });

                response.on('end', () => {
                    if (signal) {
                        signal.removeEventListener('abort', onAbort);
                    }

                    // Final progress report
                    if (onProgress) {
                        onProgress({
                            bytes,
                            total,
                            percentage: 100
                        });
                    }

                    // Wait for the write stream to fully flush to disk
                    // before resolving. Without this, adm-zip may try to
                    // read an incomplete file.
                    if (fileStream) {
                        fileStream.end();
                        fileStream.on('finish', () => {
                            fileStream = null;
                            resolve(tempPath);
                        });
                    } else {
                        resolve(tempPath);
                    }
                });

                response.on('error', (err) => {
                    cleanup();
                    reject(new Error(`Download stream error: ${err.message}`));
                });

                // Pipe response to file
                response.pipe(fileStream);
            });

            request.on('error', (err) => {
                cleanup();
                reject(new Error(`Download request error: ${err.message}`));
            });

            request.setTimeout(30000, () => {
                request.destroy();
                cleanup();
                reject(new Error('Download timed out'));
            });

        } catch (err) {
            cleanup();
            reject(new Error(`Download failed: ${err.message}`));
        }
    });
}

module.exports = { download };