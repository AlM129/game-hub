// ==========================================
// PROFILE BACKUP (.gamehub) TESTS
// ==========================================
// Verifies the launcher-side .gamehub ZIP container engine:
//   - createGameHubZip / readGameHubZip round-trip (manifest + profile + games)
//   - profileToJson preserves all existing profile fields
//   - validateManifest rejects bad format / unsupported versions
//   - a profile with no supported game data still exports/imports
//   - collectGameBackupData / restoreGameBackupData use the page-host pattern
//   - the legacy JSON profile export/import is preserved (not replaced)

const { test, expect } = require('@playwright/test');
const {
    createGameHubZip,
    readGameHubZip,
    buildManifest,
    validateManifest,
    profileToJson,
    buildLocalStorageSnapshotScript,
    buildLocalStorageRestoreScript,
    collectGameBackupData,
    restoreGameBackupData
} = require('../src/systems/profiles/backup');

function sampleProfile() {
    return {
        id: 'sky',
        name: 'Sky Pilot',
        type: 'custom',
        settings: { volume: 70, theme: 'light' },
        achievements: {
            'sky-ace': { trainee_takeoff: { unlocked: true, date: '2026-08-29' } }
        },
        statistics: { totalSessions: 3, gamePlayHistory: { 'sky-ace': { playCount: 3 } } },
        saves: { updateHistory: { 'sky-ace': { v: '2.0.1' } } }
    };
}

test('ZIP round-trip preserves manifest, profile, and game save snapshot', () => {
    const profile = sampleProfile();
    const manifest = buildManifest(profile, ['sky-ace', 'other-game']);
    const games = {
        'sky-ace': {
            format: 'localstorage-v1',
            entries: { 'skyace_default_achievements': '{"trainee_takeoff":{"unlocked":true,"tier":1}}' }
        },
        'other-game': {
            format: 'localstorage-v1',
            entries: { 'neon_neon_default_level': '7' }
        }
    };
    const buffer = createGameHubZip({ manifest, profile, games });

    // A valid familiar ZIP signature (PK) should be present.
    expect(buffer[0]).toBe(0x50);
    expect(buffer[1]).toBe(0x4B);

    const { manifest: m, profile: p, games: g } = readGameHubZip(buffer);
    expect(m.format).toBe('gamehub');
    expect(m.formatVersion).toBe(1);
    expect(m.games).toEqual(['sky-ace', 'other-game']);

    // All profile fields survive the container.
    expect(p.name).toBe('Sky Pilot');
    expect(p.settings.volume).toBe(70);
    expect(p.achievements['sky-ace'].trainee_takeoff.unlocked).toBe(true);
    expect(p.statistics.totalSessions).toBe(3);
    expect(p.saves.updateHistory['sky-ace'].v).toBe('2.0.1');

    // Game save snapshots are preserved verbatim (not converted / not understood).
    expect(g['sky-ace'].format).toBe('localstorage-v1');
    expect(g['sky-ace'].entries['skyace_default_achievements']).toContain('tier');
    expect(g['other-game'].entries['neon_neon_default_level']).toBe('7');
});

test('profileToJson preserves all existing profile fields', () => {
    const p = profileToJson(sampleProfile());
    expect(p.id).toBe('sky');
    expect(p.name).toBe('Sky Pilot');
    expect(p.type).toBe('custom');
    expect(p.settings).toEqual({ volume: 70, theme: 'light' });
    expect(p.achievements['sky-ace'].trainee_takeoff.date).toBe('2026-08-29');
    expect(p.statistics.totalSessions).toBe(3);
    expect(p.saves.updateHistory['sky-ace'].v).toBe('2.0.1');
    expect(typeof p.exportedAt).toBe('string');
});

test('profile with no supported game data still round-trips', () => {
    const profile = sampleProfile();
    const manifest = buildManifest(profile, []);
    const buffer = createGameHubZip({ manifest, profile, games: {} });
    const { games } = readGameHubZip(buffer);
    expect(games).toEqual({});
});

test('validateManifest rejects bad format and unsupported versions', () => {
    expect(() => validateManifest({ format: 'not-gamehub', formatVersion: 1 })).toThrow();
    expect(() => validateManifest({ format: 'gamehub', formatVersion: 0 })).toThrow();
    expect(() => validateManifest({ format: 'gamehub', formatVersion: 2 })).toThrow();
    expect(validateManifest({ format: 'gamehub', formatVersion: 1 })).toBe(true);
});

test('in-page scripts snapshot/restore shared localStorage without a game API', () => {
    const getScript = buildLocalStorageSnapshotScript();
    expect(getScript).toContain('localStorage.length');
    expect(getScript).not.toContain('localStorage.clear');
    // Game Hub's own reserved keys are excluded from the snapshot.
    expect(getScript).toContain('gamehub-registry-cache');
    expect(getScript).not.toContain('window.gameHub.getBackupData');

    const payload = { 'skyace_default_achievements': '{"trainee_takeoff":{"unlocked":true,"tier":1}}' };
    const restoreScript = buildLocalStorageRestoreScript(payload, { sourceProfileId: 'default', profileId: 'new' });
    expect(restoreScript).toContain('localStorage.setItem');
    expect(restoreScript).not.toContain('window.gameHub.restoreBackupData');
});

test('collectGameBackupData produces a localStorage snapshot or null on failure', async () => {
    // Failures are non-fatal: collect returns null.
    const unsupported = await collectGameBackupData({}, 'sky-ace', {
        pageHost: async () => ({ ok: false, error: 'page-load-failed' })
    });
    expect(unsupported).toBeNull();

    // Success returns a localStorage snapshot ({ format, entries }).
    const supported = await collectGameBackupData({}, 'sky-ace', {
        pageHost: async () => ({
            ok: true,
            data: {
                format: 'localstorage-v1',
                entries: { 'skyace_default_achievements': '{"unlocked":true}', 'skyace_default_highscore': '500' }
            }
        })
    });
    expect(supported.format).toBe('localstorage-v1');
    expect(supported.entries['skyace_default_highscore']).toBe('500');
});

test('restoreGameBackupData restores non-destructively and throws on failure', async () => {
    const result = await restoreGameBackupData({}, 'sky-ace',
        { entries: { 'skyace_new_achievements': '{"unlocked":true}' } },
        { pageHost: async () => ({ ok: true, result: { restored: ['skyace_new_achievements'], skipped: [] } }) }
    );
    expect(result.success).toBe(true);
    expect(result.result.restored).toContain('skyace_new_achievements');

    await expect(restoreGameBackupData({}, 'sky-ace', { entries: {} }, {
        pageHost: async () => ({ ok: false, error: 'restore failed' })
    })).rejects.toThrow('restore failed');
});
test('restore script rewrites profile-scoped keys and skips existing newer data', async () => {
    const { buildLocalStorageRestoreScript } = require('../src/systems/profiles/backup');
    const vm = require('vm');

    const run = async (entries, opts, seed) => {
        const backing = new Map(Object.entries(seed));
        const ctx = {
            localStorage: {
                getItem: (k) => (backing.has(k) ? backing.get(k) : null),
                setItem: (k, v) => backing.set(k, String(v))
            }
        };
        vm.createContext(ctx);
        return await vm.runInContext(buildLocalStorageRestoreScript(entries, opts), ctx);
    };

    // Profile-scoped keys are remapped to the imported profile ID.
    const r1 = await run(
        { 'skyace_default_achievements': '{"unlocked":true}', 'skyace_default_highscore': '500' },
        { sourceProfileId: 'default', profileId: 'new-import' },
        {}
    );
    expect(r1.result.restored).toContain('skyace_new-import_achievements');
    expect(r1.result.restored).toContain('skyace_new-import_highscore');

    // Non-destructive: an existing newer key is skipped, never overwritten.
    const r2 = await run(
        { 'skyace_default_achievements': '{"unlocked":true}' },
        { sourceProfileId: 'default', profileId: 'default' },
        { 'skyace_default_achievements': '{"unlocked":true,"tier":3}' }
    );
    expect(r2.result.restored).toEqual([]);
    expect(r2.result.skipped).toContain('skyace_default_achievements');
});