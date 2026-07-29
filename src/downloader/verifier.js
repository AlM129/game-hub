// ==========================================
// VERIFIER
// ==========================================
// Calculates SHA-256 checksums and compares them against
// expected values to detect corrupted downloads.
//
// Uses Node.js built-in crypto module — no external dependencies.

const fs = require('fs');
const crypto = require('crypto');

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
 * @param {string} filePath - Path to the downloaded file
 * @param {string} expectedChecksum - Expected hex-encoded SHA-256 checksum
 * @returns {Promise<{ valid: boolean, actual: string, expected: string }>}
 */
async function verifyChecksum(filePath, expectedChecksum) {
    if (!expectedChecksum) {
        // No checksum provided — skip verification
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