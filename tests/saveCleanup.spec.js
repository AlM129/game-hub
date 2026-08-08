// ==========================================
// SAVE CLEANUP + UNINSTALL ORCHESTRATION TESTS
// ==========================================
// Verifies the save-data deletion integration in the uninstall flow:
//   Test A - normal uninstall (checkbox off): clearSaveData() is NOT called,
//            files/metadata uninstall still runs, saves preserved.
//   Test B - checked: clearSaveData({ deleteSaves:true, deletePreferences:false })
//            is invoked, succeeds, then files/metadata uninstall runs.
//   Test C - save API failure: uninstall aborts, no file deletion, no false
//            success claim.
//   Extra  - timeout path, queue preservation, and "never delete preferences
//            / never use localStorage.clear()" guarantees at the launcher layer.
//
// Uses injected fake page hosts / fns so the real saveCleanup module runs
// through its actual code paths without needing Electron.

const { test, expect } = require('@playwright/test');

const {
    buildClearSaveScript,
    clearGameSaveData,
    uninstallGameWithSaveHandling,
    CLEAR_OPTS
} = require('../src/downloader/saveCleanup');

// ==========================================
// Test A — Normal uninstall (checkbox unchecked)
// ==========================================
test('A: unchecked does not call clearSaveData, still uninstalls files/metadata', async () => {
    const calls = { clear: 0, uninstall: [] };
    const clearFn = async () => { calls.clear += 1; return { success: true }; };
    const uninstallFn = (app, id, opts, store) => {
        calls.uninstall.push(opts);
        return { success: true, gameId: id };
    };

    const result = await uninstallGameWithSaveHandling({
        app: {},
        gameId: 'sky-ace',
        options: { deleteSaves: false },
        store: {},
        clearFn,
        uninstallFn
    });

    expect(result.success).toBe(true);
    expect(result.deleteSaves).toBe(false);
    expect(result.saveCleared).toBe(false);
    expect(result.filesDeleted).toBe(true);
    // clearSaveData is NOT invoked
    expect(calls.clear).toBe(0);
    // Filesystem/metadata uninstall still runs
    expect(calls.uninstall).toHaveLength(1);
    expect(calls.uninstall[0].deleteSaves).toBe(false);
});

// ==========================================
// Test B — Uninstall with save deletion (checkbox checked)
// ==========================================
test('B: checked invokes clearSaveData with deleteSaves:true / deletePreferences:false, then uninstalls', async () => {
    // Capture the script handed to the game page so we can assert exact options.
    let capturedScript = null;
    const pageHost = async (script) => {
        capturedScript = script;
        return { ok: true, result: { ok: true, removed: ['skyace_p1_achievements'] } };
    };

    const clearResult = await clearGameSaveData({}, 'sky-ace', { pageHost, deleteSaves: true });
    expect(clearResult.success).toBe(true);
    expect(capturedScript).toContain('deleteSaves":true');
    expect(capturedScript).toContain('deletePreferences":false');
    // The launcher must never clear all of localStorage or touch the shared queue
    expect(capturedScript).not.toContain('localStorage.clear');
    expect(capturedScript).not.toContain('game-hub-event-queue');

    // Full orchestration: clear succeeds -> uninstall proceeds
    const calls = { clear: [], uninstall: [] };
    const clearFn = async (app, id) => { calls.clear.push(id); return { success: true }; };
    const uninstallFn = (app, id, opts, store) => {
        calls.uninstall.push(opts);
        return { success: true, gameId: id };
    };
    const result = await uninstallGameWithSaveHandling({
        app: {},
        gameId: 'neon-survival',
        options: { deleteSaves: true },
        store: {},
        clearFn,
        uninstallFn
    });

    expect(result.success).toBe(true);
    expect(result.saveCleared).toBe(true);
    expect(result.filesDeleted).toBe(true);
    expect(calls.clear).toEqual(['neon-survival']);
    expect(calls.uninstall).toHaveLength(1);
});

// ==========================================
// Test C — Save API failure
// ==========================================
test('C: save API failure aborts uninstall and does not falsely report success', async () => {
    const pageHost = async () => ({ ok: false, error: 'save-api-timeout', timedOut: true });

    await expect(clearGameSaveData({}, 'sky-ace', { pageHost })).rejects.toThrow('save-api-timeout');

    // Orchestration: clear throws -> uninstall is ABORTED (no file deletion)
    const uninstallCalls = [];
    const result = await uninstallGameWithSaveHandling({
        app: {},
        gameId: 'sky-ace',
        options: { deleteSaves: true },
        store: {},
        clearFn: (app, id) => clearGameSaveData(app, id, { pageHost }),
        uninstallFn: (app, id, opts, store) => { uninstallCalls.push(true); return { success: true }; }
    });

    expect(result.success).toBe(false);
    expect(result.saveCleared).toBe(false);
    expect(result.filesDeleted).toBe(false);
    expect(result.saveError).toBe('save-api-timeout');
    expect(result.error).toContain('Save data could not be deleted');
    // Never delete files when save deletion failed
    expect(uninstallCalls).toHaveLength(0);
});

// ==========================================
// Extra — timeout path / API never becomes ready
// ==========================================
test('timeout: clearSaveData never available -> clear rejects, uninstall aborted', async () => {
    const pageHost = async () => ({ ok: false, error: 'save-api-timeout', timedOut: true });
    const result = await uninstallGameWithSaveHandling({
        app: {},
        gameId: 'tactical-drone-defense',
        options: { deleteSaves: true },
        store: {},
        clearFn: (app, id) => clearGameSaveData(app, id, { pageHost }),
        uninstallFn: () => { throw new Error('must not be called'); }
    });
    expect(result.success).toBe(false);
    expect(result.filesDeleted).toBe(false);
    expect(result.saveError).toBe('save-api-timeout');
});

// ==========================================
// Extra — preferences never deleted, queue never touched (launcher layer)
// ==========================================
test('D/E guarantee: script requests deletePreferences:false, never touches queue or clears storage', () => {
    const script = buildClearSaveScript(CLEAR_OPTS, 999);
    // deletePreferences must stay false (Neon Survival settings survive)
    expect(script).toContain('deletePreferences":false');
    expect(script).toContain('deleteSaves":true');
    // Shared queue is never referenced / cleared by the launcher
    expect(script).not.toContain('game-hub-event-queue');
    // The launcher never issues a blanket localStorage wipe
    expect(script).not.toContain('localStorage.clear');
    expect(script).not.toContain('localStorage.removeItem');
});

// ==========================================
// Extra — gameId isolation / validation
// ==========================================
test('gameId isolation: invalid gameId is rejected by clearGameSaveData', async () => {
    const pageHost = async () => ({ ok: true, result: {} });
    await expect(clearGameSaveData({}, 'UPPERCASE', { pageHost })).rejects.toThrow('Invalid gameId');
    // A different (valid) id must be the only one targeted by orchestration
    const targeted = [];
    const clearFn = async (app, id) => { targeted.push(id); return { success: true }; };
    const uninstallFn = (app, id, opts, store) => ({ success: true, gameId: id });
    await uninstallGameWithSaveHandling({
        app: {},
        gameId: 'neon-survival',
        options: { deleteSaves: true },
        store: {},
        clearFn,
        uninstallFn
    });
    expect(targeted).toEqual(['neon-survival']);
});

// ==========================================
// Regression — clearGameSaveData passes the caller's requested deleteSaves
// ==========================================
// The launcher must never request save deletion when the uninstall checkbox is
// unchecked. clearGameSaveData must forward deleteSaves:false unless the caller
// explicitly passed deleteSaves:true.
test('clearGameSaveData forwards deleteSaves:false when not explicitly true', async () => {
    const capture = async (options) => {
        let script = null;
        await clearGameSaveData({}, 'sky-ace', {
            pageHost: async (s) => { script = s; return { ok: true, result: {} }; },
            ...options
        }).catch((e) => {
            // Preserve the captured script even if the host rejects.
            throw e;
        });
        return script;
    };

    // No deleteSaves supplied -> must NOT request save deletion
    let script = await capture({});
    expect(script).toContain('deleteSaves\":false');
    expect(script).not.toContain('deleteSaves\":true');

    // Explicit deleteSaves:false -> must NOT request save deletion
    script = await capture({ deleteSaves: false });
    expect(script).toContain('deleteSaves\":false');
    expect(script).not.toContain('deleteSaves\":true');

    // deletePreferences is never true through this path
    expect(script).toContain('deletePreferences\":false');
});

test('clearGameSaveData forwards deleteSaves:true only when explicitly requested', async () => {
    let script = null;
    await clearGameSaveData({}, 'sky-ace', {
        pageHost: async (s) => { script = s; return { ok: true, result: {} }; },
        deleteSaves: true
    });
    expect(script).toContain('deleteSaves\":true');
    expect(script).toContain('deletePreferences\":false');
});

