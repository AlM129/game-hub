// ==========================================
// VERIFIER
// ==========================================
// Calculates SHA-256 checksums and compares them against
// expected values to detect corrupted downloads.
//
// Stable channel releases REQUIRE a checksum — missing checksums
// are rejected. Development/non-stable builds may omit checksums.
//
// Uses Node.js built-in crypto module — no external dependencies.

const fs = require('fs');
const crypto = require('crypto');

// Release channels that require a checksum to be present.
// Missing channels default to 'stable' (the safest behavior).
const CHECKSUM_REQUIRED_CHANNELS = ['stable'];

/**
 * Calculate the SHA-256 checksum of a file.
 * Streams the file to handle large files efficiently.
 *
 * @param {string} filePath - Path to the file
 * @returns {Promise<string>} Hex-encoded SHA-256 digest
 */
function calculateChecksum(filePath) {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        const stream = fs.createReadStream(filePath);

        stream.on('data', (chunk) => {
            hash.update(chunk);
        });

        stream.on('end', () => {
            resolve(hash.digest('hex'));
        });

        stream.on('error', (err) => {
            reject(new Error(`Failed to read file for checksum: ${err.message}`));
        });
    });
}

/**
 * Verify a file's SHA-256 checksum against an expected value.
 *
 * Stable channel releases REQUIRE a checksum — if none is provided,
 * verification fails and the install is rejected. Development and
 * other non-stable channel releases may omit the checksum, in which
 * case verification is skipped.
 *
 * @param {string} filePath - Path to the downloaded file
 * @param {string} expectedChecksum - Expected hex-encoded SHA-256 checksum
 * @param {string} [channel='stable'] - Release channel (stable, development, beta, alpha, demo)
 * @returns {Promise<{ valid: boolean, actual: string, expected: string, skipped: boolean, error?: string }>}
 */
async function verifyChecksum(filePath, expectedChecksum, channel = 'stable') {
    const isChecksumRequired = !channel || CHECKSUM_REQUIRED_CHANNELS.includes(channel);

    if (!expectedChecksum) {
        if (isChecksumRequired) {
            // Stable releases must always ship with a checksum
            return {
                valid: false,
                actual: null,
                expected: null,
                skipped: true,
                error: `Checksum is required for the ${channel || 'stable'} channel but none was provided`
            };
        }

        // Development/non-stable build without checksum — skip verification
        return { valid: true, actual: null, expected: null, skipped: true };
    }

    const actual = await calculateChecksum(filePath);
    const expected = expectedChecksum.toLowerCase();
    const valid = actual === expected;

    if (!valid) {
        console.error(`Checksum mismatch for ${filePath}:`);
        console.error(`  Expected: ${expected}`);
        console.error(`  Actual:   ${actual}`);
    }

    return { valid, actual, expected, skipped: false };
}

module.exports = { calculateChecksum, verifyChecksum };
