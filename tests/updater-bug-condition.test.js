/**
 * Bug Condition Exploration Test — Stale adm-zip Skip Bug
 *
 * **Validates: Requirements 1.1, 1.2, 1.3**
 *
 * Property 1: Bug Condition — Fresh adm-zip Copy Per Update Attempt
 *
 * This test is written against UNFIXED code and is EXPECTED TO FAIL.
 * Failure confirms the bug exists:
 *   - fs.cpSync is skipped when a stale admZipDest directory already exists
 *   - Script and manifest are placed in the shared tempDir root (not isolated per-attempt dirs)
 *
 * EXPECTED OUTCOME: Both tests FAIL on unfixed code.
 */

'use strict';

const path = require('path');
const fc = require('fast-check');

// ─── Constants ───────────────────────────────────────────────────────────────
const FAKE_TEMP_DIR = '/tmp/fake-gamehub-temp';
const FAKE_RESOURCES_PATH = '/fake/app/Contents/Resources';
const FAKE_EXEC_PATH = '/fake/app.app/Contents/MacOS/Game Hub';
const FAKE_APP_PATH = '/fake/app.app';
const FAKE_NODE_BIN = '/usr/local/bin/node';
const FAKE_ZIP_PATH = path.join(FAKE_TEMP_DIR, 'gamehub-update.zip');
const FAKE_ADM_ZIP_SRC = path.join(FAKE_RESOURCES_PATH, 'node_modules', 'adm-zip');
// The shared-tempDir location that the UNFIXED code uses for admZipDest:
const STALE_ADM_ZIP_DEST = path.join(FAKE_TEMP_DIR, 'node_modules', 'adm-zip');

// ─── Module-level mock state (mock-prefixed for Jest hoisting) ───────────────
let mockCapturedHandlers = {};
let mockFsCpSync = jest.fn();
let mockFsExistsSync = jest.fn();
let mockFsMkdtempSync = jest.fn();
let mockFsCopyFileSync = jest.fn();
let mockFsWriteFileSync = jest.fn();
let mockFsOpenSync = jest.fn();
let mockFsCloseSync = jest.fn();
let mockFsStatSync = jest.fn();
let mockSpawn = jest.fn();
let mockAppQuit = jest.fn();
let mockAppReadyCallback = null;

// ─── Mocks — only mock-prefixed vars accessible in factories (Jest hoisting) ──

jest.mock('electron', () => ({
    app: {
        getPath: jest.fn((name) => {
            if (name === 'temp') return FAKE_TEMP_DIR;
            if (name === 'userData') return '/fake/userData';
            return '/fake/' + name;
        }),
        getVersion: jest.fn().mockReturnValue('2.0.0'),
        quit: jest.fn((...args) => mockAppQuit(...args)),
        // isPackaged = true so setupUpdater() proceeds into the test-update block
        isPackaged: true,
        whenReady: jest.fn(() => ({
            then: (cb) => {
                mockAppReadyCallback = cb;
                return { catch: jest.fn() };
            }
        })),
        requestSingleInstanceLock: jest.fn().mockReturnValue(true),
        on: jest.fn(),
    },
    BrowserWindow: jest.fn().mockImplementation(() => ({
        loadFile: jest.fn(),
        webContents: { once: jest.fn((evt, cb) => { if (evt === 'did-finish-load') cb(); }, ), send: jest.fn(), on: jest.fn() },
        isDestroyed: jest.fn().mockReturnValue(false),
        isMinimized: jest.fn().mockReturnValue(false),
        restore: jest.fn(),
        focus: jest.fn(),
    })),
    ipcMain: {
        handle: jest.fn((channel, handler) => {
            mockCapturedHandlers[channel] = handler;
        }),
    },
}), { virtual: false });

jest.mock('electron-store', () => ({
    default: jest.fn().mockImplementation(() => ({
        get: jest.fn().mockReturnValue(undefined),
        set: jest.fn(),
        delete: jest.fn(),
        has: jest.fn().mockReturnValue(false),
        store: {},
    })),
}));

jest.mock('electron-updater', () => ({
    autoUpdater: {
        autoDownload: false,
        logger: null,
        on: jest.fn(),
        checkForUpdates: jest.fn().mockResolvedValue({}),
    },
}));

jest.mock('../src/downloader/manager', () => ({
    startDownload: jest.fn(),
    cancelDownload: jest.fn(),
    getDownloadStatus: jest.fn(),
    getActiveDownloads: jest.fn().mockReturnValue([]),
}));

jest.mock('../src/downloader/saveCleanup', () => ({
    uninstallGameWithSaveHandling: jest.fn(),
}));

jest.mock('fs', () => {
    const realFs = jest.requireActual('fs');
    return {
        ...realFs,
        existsSync: (...args) => mockFsExistsSync(...args),
        cpSync: (...args) => mockFsCpSync(...args),
        copyFileSync: (...args) => mockFsCopyFileSync(...args),
        writeFileSync: (...args) => mockFsWriteFileSync(...args),
        openSync: (...args) => mockFsOpenSync(...args),
        closeSync: (...args) => mockFsCloseSync(...args),
        mkdtempSync: (...args) => mockFsMkdtempSync(...args),
        statSync: (...args) => mockFsStatSync(...args),
        createWriteStream: jest.fn().mockReturnValue({
            on: jest.fn(),
            close: jest.fn(),
            pipe: jest.fn(),
        }),
    };
});

jest.mock('child_process', () => ({
    spawn: (...args) => mockSpawn(...args),
}));

// ─── Set process properties before loading main ───────────────────────────────
Object.defineProperty(process, 'execPath', { value: FAKE_EXEC_PATH, configurable: true });
Object.defineProperty(process, 'resourcesPath', { value: FAKE_RESOURCES_PATH, configurable: true });
Object.defineProperty(process, 'arch', { value: 'arm64', configurable: true });
// Set test update env var so setupUpdater() sets cachedUpdateAssetUrl
process.env.GAMEHUB_TEST_UPDATE = '1';
process.env.GAMEHUB_TEST_UPDATE_URL = 'http://127.0.0.1:8123/Game-Hub-2.0.1-arm64-mac.zip';
process.env.PATH = FAKE_NODE_BIN.replace('/node', '');

// ─── Set initial mock defaults before loading main ─────────────────────────────
// existsSync defaults: allow main to load without crashing
mockFsExistsSync.mockImplementation((p) => {
    if (p === FAKE_ZIP_PATH) return true;
    if (p === path.join(FAKE_APP_PATH, 'Contents')) return true;
    if (p === FAKE_ADM_ZIP_SRC) return true;
    if (p === STALE_ADM_ZIP_DEST) return false;
    return false;
});
mockFsOpenSync.mockReturnValue(42);
mockFsMkdtempSync.mockReturnValue(path.join(FAKE_TEMP_DIR, 'gamehub-update-ABCDEF'));
mockFsStatSync.mockImplementation((p) => {
    if (p === FAKE_NODE_BIN) return { isFile: () => true };
    const err = new Error('ENOENT'); err.code = 'ENOENT'; throw err;
});
const mockChild = { unref: jest.fn() };
mockSpawn.mockReturnValue(mockChild);

// ─── Load main.js once at module level ───────────────────────────────────────
require('../main');

// Trigger the whenReady callback to register all IPC handlers
if (mockAppReadyCallback) {
    mockAppReadyCallback();
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: reset per-invocation mocks with controlled admZipDestExists state
// ─────────────────────────────────────────────────────────────────────────────
function resetInvocationMocks({ admZipDestExists = false } = {}) {
    mockFsCpSync.mockReset();
    mockFsCopyFileSync.mockReset();
    mockFsWriteFileSync.mockReset();
    mockFsOpenSync.mockReset().mockReturnValue(42);
    mockFsCloseSync.mockReset();
    mockFsMkdtempSync.mockReset().mockReturnValue(path.join(FAKE_TEMP_DIR, 'gamehub-update-ABCDEF'));
    mockAppQuit.mockReset();

    // Reset the child mock
    const child = { unref: jest.fn() };
    mockSpawn.mockReset().mockReturnValue(child);

    mockFsStatSync.mockReset().mockImplementation((p) => {
        if (p === FAKE_NODE_BIN) return { isFile: () => true };
        const err = new Error('ENOENT'); err.code = 'ENOENT'; throw err;
    });

    mockFsExistsSync.mockReset().mockImplementation((p) => {
        if (p === FAKE_ZIP_PATH) return true;
        if (p === path.join(FAKE_APP_PATH, 'Contents')) return true;
        if (p === FAKE_ADM_ZIP_SRC) return true;
        // Stale admZipDest: controlled by test scenario
        if (p === STALE_ADM_ZIP_DEST) return admZipDestExists;
        return false;
    });
}

// ─── Helper: prime launcherUpdateReady via app:downloadUpdate ─────────────────
// cachedUpdateAssetUrl was set by setupUpdater() via GAMEHUB_TEST_UPDATE=1.
// existsSync returns true for zipPath → takes the cached-zip branch → sets launcherUpdateReady=true.
async function primeUpdateReady() {
    const handler = mockCapturedHandlers['app:downloadUpdate'];
    if (!handler) throw new Error('app:downloadUpdate handler not registered');
    await handler();
}

// ─── Helper: invoke the installUpdate handler ─────────────────────────────────
async function invokeInstallUpdate({ admZipDestExists = false } = {}) {
    resetInvocationMocks({ admZipDestExists });
    // Re-prime launcherUpdateReady = true
    // (The mock existsSync returns true for zipPath so downloadUpdate uses cached path)
    await primeUpdateReady();

    const handler = mockCapturedHandlers['app:installUpdate'];
    if (!handler) throw new Error('app:installUpdate handler not registered');
    return handler();
}

// ─────────────────────────────────────────────────────────────────────────────
// BUG CONDITION TESTS
// ─────────────────────────────────────────────────────────────────────────────

describe('Bug condition: stale adm-zip in shared tempDir', () => {
    beforeEach(() => {
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    /**
     * Property 1 — Bug Condition Test
     *
     * **Validates: Requirements 1.1, 1.2, 1.3**
     *
     * Pre-condition: stale admZipDest directory exists at STALE_ADM_ZIP_DEST.
     * Assertion: fs.cpSync IS called (unconditionally).
     *
     * EXPECTED: FAIL on unfixed code (existsSync guard skips the copy).
     */
    it('cpSync should be called unconditionally even when stale admZipDest exists (fails on unfixed code)', async () => {
        await fc.assert(
            fc.asyncProperty(
                // Vary some irrelevant context to show the failure is not a fluke
                fc.record({
                    ignored: fc.string({ minLength: 0, maxLength: 5 }),
                }),
                async (_ctx) => {
                    // Bug condition: stale admZipDest exists
                    await invokeInstallUpdate({ admZipDestExists: true });

                    // ASSERTION: cpSync MUST have been called for the adm-zip copy
                    // On UNFIXED code: this assertion FAILS because the existsSync guard
                    // skips cpSync when admZipDest already exists.
                    const cpSyncCalledForAdmZip = mockFsCpSync.mock.calls.some(
                        (callArgs) =>
                            typeof callArgs[0] === 'string' &&
                            callArgs[0].includes('adm-zip') &&
                            typeof callArgs[1] === 'string' &&
                            callArgs[1].includes('adm-zip')
                    );

                    expect(cpSyncCalledForAdmZip).toBe(true);
                }
            ),
            { numRuns: 3, seed: 42 }
        );
    });

    /**
     * Property 1 — Isolation Test
     *
     * **Validates: Requirements 1.1, 1.3**
     *
     * Pre-condition: any update attempt (stale OR clean).
     * Assertion: copiedScriptPath and manifestPath are inside an isolated per-attempt
     * subdirectory of tempDir, NOT directly in the tempDir root.
     *
     * EXPECTED: FAIL on unfixed code (files are written to tempDir root).
     */
    it('script and manifest should be in isolated per-attempt directory, not tempDir root (fails on unfixed code)', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.boolean(), // stale adm-zip or clean
                async (admZipDestExists) => {
                    await invokeInstallUpdate({ admZipDestExists });

                    // On UNFIXED code:
                    //   copiedScriptPath = path.join(tempDir, 'macExternalUpdater.js')
                    //   manifestPath     = path.join(tempDir, 'gamehub-update-manifest.json')
                    // Both are directly in the tempDir root — NOT in a subdirectory.

                    // Collect paths from copyFileSync calls (for the script)
                    const scriptCopyCall = mockFsCopyFileSync.mock.calls.find(
                        (args) => typeof args[0] === 'string' && args[0].includes('macExternalUpdater')
                    );
                    expect(scriptCopyCall).toBeDefined();
                    const copiedScriptPath = scriptCopyCall[1];

                    // Collect paths from writeFileSync calls (for the manifest)
                    const manifestWriteCall = mockFsWriteFileSync.mock.calls.find(
                        (args) => typeof args[0] === 'string' && args[0].includes('manifest')
                    );
                    expect(manifestWriteCall).toBeDefined();
                    const manifestPath = manifestWriteCall[0];

                    // ASSERTION: paths must NOT be directly in the tempDir root
                    // On UNFIXED code these equal path.join(tempDir, filename) → FAILS.
                    const copiedScriptDir = path.dirname(copiedScriptPath);
                    const manifestDir = path.dirname(manifestPath);

                    expect(copiedScriptDir).not.toBe(FAKE_TEMP_DIR);
                    expect(manifestDir).not.toBe(FAKE_TEMP_DIR);

                    // ASSERTION: they must be inside a subdirectory of tempDir
                    expect(copiedScriptDir.startsWith(FAKE_TEMP_DIR + path.sep)).toBe(true);
                    expect(manifestDir.startsWith(FAKE_TEMP_DIR + path.sep)).toBe(true);
                }
            ),
            { numRuns: 2, seed: 42 }
        );
    });
});
