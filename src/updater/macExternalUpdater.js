#!/usr/bin/env node

/**
 * External macOS updater for Game Hub.
 *
 * This script is spawned by the main Game Hub process after it has
 * downloaded an update ZIP. It performs the actual .app bundle replacement
 * without using Squirrel.Mac.
 *
 * Usage: node macExternalUpdater.js <manifest.json>
 *
 * The manifest contains:
 *   - zipPath: path to the downloaded update ZIP
 *   - appPath: path to the existing Game Hub.app bundle
 *   - arch: target architecture (x64 or arm64)
 *   - version: target version string
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

async function main() {
    const manifestPath = process.argv[2];
    if (!manifestPath) {
        console.error('[Updater] No manifest path provided.');
        process.exit(1);
    }

    let manifest;
    try {
        manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    } catch (e) {
        console.error(`[Updater] Failed to read manifest: ${e.message}`);
        process.exit(1);
    }

    const { zipPath, appPath, arch, version } = manifest;
    console.log(`[Updater] Starting update to v${version} for arch=${arch}`);
    console.log(`[Updater] zipPath=${zipPath}`);
    console.log(`[Updater] appPath=${appPath}`);

    // Validate inputs
    if (!fs.existsSync(zipPath)) {
        console.error(`[Updater] ZIP not found: ${zipPath}`);
        process.exit(1);
    }

    if (!fs.existsSync(appPath)) {
        console.error(`[Updater] Existing app not found: ${appPath}`);
        process.exit(1);
    }

    const expectedAppName = 'Game Hub.app';
    if (!appPath.endsWith(expectedAppName)) {
        console.error(`[Updater] Refusing to replace non-standard app path: ${appPath}`);
        process.exit(1);
    }

    // Create temp directory for extraction
    const tempDir = fs.mkdtempSync(path.join(appPath, '..', 'gamehub-updater-'));
    const extractedAppPath = path.join(tempDir, expectedAppName);

    // Extract ZIP using macOS native ditto to preserve binary file modes,
    // symlinks, and resource forks that adm-zip corrupts on Electron bundles.
    console.log(`[Updater] Extracting ${zipPath} -> ${tempDir}`);
    const dittoResult = spawnSync('ditto', ['-x', '-k', zipPath, tempDir], {
        stdio: ['ignore', 'pipe', 'pipe']
    });
    if (dittoResult.error) {
        console.error(`[Updater] Failed to extract ZIP with ditto: ${dittoResult.error.message}`);
        cleanupAndExit(tempDir, 1);
    }
    if (dittoResult.status !== 0) {
        const stderr = dittoResult.stderr ? dittoResult.stderr.toString().trim() : '';
        console.error(`[Updater] Failed to extract ZIP with ditto: exit ${dittoResult.status}${stderr ? ' — ' + stderr : ''}`);
        cleanupAndExit(tempDir, 1);
    }

    // Validate extracted bundle
    if (!fs.existsSync(extractedAppPath)) {
        console.error(`[Updater] Extracted app not found at: ${extractedAppPath}`);
        cleanupAndExit(tempDir, 1);
    }

    // Verify the extracted bundle is actually an .app directory
    if (!fs.statSync(extractedAppPath).isDirectory()) {
        console.error(`[Updater] Extracted path is not a directory: ${extractedAppPath}`);
        cleanupAndExit(tempDir, 1);
    }

    // Move existing app to backup
    const backupPath = appPath + '.backup';
    console.log(`[Updater] Backing up existing app to: ${backupPath}`);
    try {
        if (fs.existsSync(backupPath)) {
            fs.rmSync(backupPath, { recursive: true, force: true });
        }
        fs.renameSync(appPath, backupPath);
    } catch (e) {
        console.error(`[Updater] Failed to backup existing app: ${e.message}`);
        cleanupAndExit(tempDir, 1);
    }

    // Move new app into place using macOS ditto so the app bundle's symlinks,
    // permissions, extended attributes, and framework structure are preserved.
    // (fs.renameSync corrupts the Electron Framework's Versions/Current symlink,
    // which makes dyld unable to resolve the framework at launch.)
    console.log(`[Updater] Installing new app: ${extractedAppPath} -> ${appPath}`);
    const installResult = spawnSync('ditto', [extractedAppPath, appPath], {
        stdio: ['ignore', 'pipe', 'pipe']
    });
    let installError = null;
    if (installResult.error) {
        installError = `Failed to install new app: ${installResult.error.message}`;
    } else if (installResult.status !== 0) {
        const stderr = installResult.stderr ? installResult.stderr.toString().trim() : '';
        installError = `Failed to install new app: exit ${installResult.status}${stderr ? ' — ' + stderr : ''}`;
    }
    if (installError) {
        console.error(`[Updater] ${installError}`);
        // Rollback: restore backup
        try {
            fs.rmSync(appPath, { recursive: true, force: true });
            fs.renameSync(backupPath, appPath);
            console.log('[Updater] Rolled back to previous app.');
        } catch (rollbackError) {
            console.error(`[Updater] Rollback failed: ${rollbackError.message}`);
        }
        cleanupAndExit(tempDir, 1);
    }

    // Launch the new app via macOS `open` for reliable relaunch
    console.log(`[Updater] Launching new app: ${appPath}`);
    // Executable inside the installed bundle, used to verify the running process.
    const executablePath = path.join(appPath, 'Contents', 'MacOS', 'Game Hub');
    console.log(`[Updater] App executable: ${executablePath}`);

    try {
        // Request the launch using the absolute open binary and check its result.
        const openResult = spawnSync('/usr/bin/open', [appPath], {
            stdio: ['ignore', 'pipe', 'pipe']
        });
        if (openResult.error) {
            throw new Error(`open could not be invoked: ${openResult.error.message}`);
        }
        if (openResult.status !== 0) {
            const stderr = openResult.stderr ? openResult.stderr.toString().trim() : '';
            throw new Error(`open exited with status ${openResult.status}${stderr ? ' — ' + stderr : ''}`);
        }
        const openStderr = openResult.stderr ? openResult.stderr.toString().trim() : '';
        console.log(`[Updater] /usr/bin/open result: exit=${openResult.status}${openStderr ? ', stderr=' + openStderr : ''}`);

        // Wait briefly to ensure the new app starts
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Actually verify the new Game Hub process is running by checking for the
        // installed executable. pgrep -f matches against the full process listing.
        const pgrepResult = spawnSync('pgrep', ['-f', executablePath], {
            stdio: ['ignore', 'pipe', 'pipe']
        });
        // pgrep returns 0 when at least one matching process is found, 1 when none.
        const processFound = pgrepResult.status === 0;
        console.log(`[Updater] Process check: executable=${executablePath}, found=${processFound}`);

        if (!processFound) {
            throw new Error('Game Hub process not detected after launch.');
        }

        console.log('[Updater] New app launched successfully.');
    } catch (e) {
        console.error(`[Updater] Failed to launch new app: ${e.message}`);
        // Rollback
        try {
            fs.rmSync(appPath, { recursive: true, force: true });
            fs.renameSync(backupPath, appPath);
            console.log('[Updater] Rolled back to previous app after launch failure.');
        } catch (rollbackError) {
            console.error(`[Updater] Rollback failed: ${rollbackError.message}`);
        }
        cleanupAndExit(tempDir, 1);
    }

    // Success! New app is running. Now it's safe to remove the backup.
    console.log('[Updater] Update completed successfully. Removing backup...');
    try {
        if (fs.existsSync(backupPath)) {
            fs.rmSync(backupPath, { recursive: true, force: true });
            console.log(`[Updater] Removed backup: ${backupPath}`);
        }
    } catch (e) {
        console.warn(`[Updater] Failed to remove backup (non-fatal): ${e.message}`);
    }

    cleanupAndExit(tempDir, 0);
}

function cleanupAndExit(tempDir, exitCode) {
    try {
        if (fs.existsSync(tempDir)) {
            // Also clean up any backup that might still exist
            const backupPath = tempDir.replace(/gamehub-updater-.*$/, '');
            // Clean the temp extraction dir
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    } catch (e) {
        console.warn(`[Updater] Cleanup warning: ${e.message}`);
    }
    process.exit(exitCode);
}

main().catch((e) => {
    console.error(`[Updater] Fatal error: ${e.message}`);
    process.exit(1);
});
