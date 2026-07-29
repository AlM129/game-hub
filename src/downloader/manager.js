// ==========================================
// DOWNLOAD MANAGER
// ==========================================
// Orchestrates the download → verify → install pipeline.
// Manages active downloads, supports cancellation, and
// coordinates between downloader, verifier, and installer modules.
//
// This module runs in the main (Node.js) process.

const { download } = require('./downloader');
const { verifyChecksum } = require('./verifier');
const { installGame } = require('./installer');

// ==========================================
// STATE
// ==========================================

// Map of active downloads: downloadId -> { gameId, abortController, state, metadata }
const activeDownloads = new Map();

let downloadCounter = 0;

// ==========================================
// DOWNLOAD MANAGEMENT
// ==========================================

/**
 * Start downloading a game.
 *
 * @param {Object} app - Electron app module (for installer paths)
 * @param {string} gameId - Game identifier
 * @param {Object} metadata - Game metadata from registry (must include download info)
 * @param {Object} [metadata.download] - Download information
 * @param {string} metadata.download.url - URL to the ZIP package
 * @param {string} [metadata.download.checksum] - Expected SHA-256 checksum
 * @param {string} [metadata.version] - Game version
 * @param {string} [metadata.channel] - Release channel
 * @param {Function} [onProgress] - Progress callback: ({ gameId, bytes, total, percentage, status })
 * @returns {{ downloadId: string }} Identifier for tracking/cancelling this download
 */
function startDownload(app, gameId, metadata, onProgress) {
    const downloadId = `dl-${gameId}-${++downloadCounter}`;
    const abortController = new AbortController();

    const entry = {
        gameId,
        abortController,
        state: 'downloading',
        metadata,
        downloadId
    };

    activeDownloads.set(downloadId, entry);

    // Start the async pipeline (don't await — let it run in background)
    runPipeline(app, gameId, metadata, abortController.signal, downloadId, onProgress).catch((err) => {
        console.error(`Download pipeline failed for ${gameId}:`, err.message);
        entry.state = 'failed';
        if (onProgress) {
            onProgress({ gameId, status: 'error', error: err.message, downloadId });
        }
    });

    return { downloadId };
}

/**
 * Cancel an active download.
 *
 * @param {string} downloadId - The download identifier
 * @returns {boolean} True if the download was found and cancelled
 */
function cancelDownload(downloadId) {
    const entry = activeDownloads.get(downloadId);
    if (!entry) {
        return false;
    }

    entry.abortController.abort();
    entry.state = 'cancelled';
    activeDownloads.delete(downloadId);
    return true;
}

/**
 * Get the status of a download.
 *
 * @param {string} downloadId
 * @returns {Object|null} Download status or null if not found
 */
function getDownloadStatus(downloadId) {
    const entry = activeDownloads.get(downloadId);
    if (!entry) return null;
    return {
        downloadId: entry.downloadId,
        gameId: entry.gameId,
        state: entry.state
    };
}

/**
 * Get all active downloads.
 *
 * @returns {Array<{ downloadId: string, gameId: string, state: string }>}
 */
function getActiveDownloads() {
    return Array.from(activeDownloads.values()).map(e => ({
        downloadId: e.downloadId,
        gameId: e.gameId,
        state: e.state
    }));
}

// ==========================================
// PIPELINE
// ==========================================

/**
 * Run the full download → verify → install pipeline.
 *
 * @param {Object} app - Electron app module
 * @param {string} gameId
 * @param {Object} metadata
 * @param {AbortSignal} signal
 * @param {string} downloadId
 * @param {Function} onProgress
 * @returns {Promise<{ path: string, extractedAt: string }>}
 */
async function runPipeline(app, gameId, metadata, signal, downloadId, onProgress) {
    const downloadUrl = metadata.download?.url;
    if (!downloadUrl) {
        throw new Error(`No download URL provided for ${gameId}`);
    }

    // Phase 1: Download
    if (onProgress) {
        onProgress({ gameId, status: 'downloading', percentage: 0, downloadId });
    }

    const tempPath = await download({
        url: downloadUrl,
        gameId,
        signal,
        onProgress: (progress) => {
            if (onProgress) {
                onProgress({
                    gameId,
                    status: 'downloading',
                    bytes: progress.bytes,
                    total: progress.total,
                    percentage: progress.percentage,
                    downloadId
                });
            }
        }
    });

    // Check if cancelled during download
    if (signal.aborted) {
        throw new Error('Download cancelled');
    }

    // Phase 2: Verify
    if (onProgress) {
        onProgress({ gameId, status: 'verifying', percentage: 100, downloadId });
    }

    const expectedChecksum = metadata.download?.checksum || null;
    const verification = await verifyChecksum(tempPath, expectedChecksum);

    if (!verification.valid) {
        // Clean up corrupted file
        try { require('fs').unlinkSync(tempPath); } catch {}
        throw new Error(`Checksum mismatch for ${gameId}: expected ${verification.expected}, got ${verification.actual}`);
    }

    // Check if cancelled during verification
    if (signal.aborted) {
        throw new Error('Download cancelled');
    }

    // Phase 3: Install
    if (onProgress) {
        onProgress({ gameId, status: 'installing', percentage: 100, downloadId });
    }

    const installResult = installGame(app, gameId, tempPath);

    // Mark as complete
    const entry = activeDownloads.get(downloadId);
    if (entry) {
        entry.state = 'completed';
        activeDownloads.delete(downloadId);
    }

    if (onProgress) {
        onProgress({
            gameId,
            status: 'completed',
            percentage: 100,
            path: installResult.path,
            extractedAt: installResult.extractedAt,
            downloadId
        });
    }

    return installResult;
}

module.exports = { startDownload, cancelDownload, getDownloadStatus, getActiveDownloads };