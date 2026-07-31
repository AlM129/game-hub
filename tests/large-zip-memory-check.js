// ==========================================
// LARGE ZIP MEMORY VERIFICATION
// ==========================================
// Verifies that the installer's ZIP header check only reads 4 bytes
// and does not scale memory usage with archive size.
//
// Run with: node --expose-gc tests/large-zip-memory-check.js
//
// Creates a large dummy ZIP (200 MB), then compares:
//   OLD: fs.readFileSync(zipPath).subarray(0, 4)   — loads entire file
//   NEW: fs.openSync + fs.readSync(fd, buf, 0, 4, 0) — loads 4 bytes
//
// Uses global.gc() to force collection between measurements so the
// before/after RSS delta reflects peak allocations accurately.

const fs = require('fs');
const os = require('os');
const path = require('path');

const SIZE_MB = 200;
const BYTES = SIZE_MB * 1024 * 1024;

function formatMB(bytes) {
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function measureRSS() {
    if (typeof global.gc === 'function') global.gc();
    return process.memoryUsage().rss;
}

// --- Build a large dummy ZIP file (valid local header, sparse-ish payload) ---
function buildLargeZip(filePath) {
    // Write a minimal-but-valid ZIP local file header, then pad the rest.
    // The first 4 bytes are the real ZIP magic signature: 50 4B 03 04.
    const fd = fs.openSync(filePath, 'w');

    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);  // local file header signature (PK\x03\x04)
    header.writeUInt16LE(20, 4);          // version needed
    header.writeUInt16LE(0, 6);           // flags
    header.writeUInt16LE(0, 8);           // compression
    header.writeUInt16LE(0, 10);          // mod time
    header.writeUInt16LE(0, 12);          // mod date
    header.writeUInt32LE(0x12345678, 14); // crc32
    header.writeUInt32LE(BYTES - 30, 18); // compressed size
    header.writeUInt32LE(BYTES - 30, 22); // uncompressed size
    header.writeUInt16LE(0, 26);          // name length
    header.writeUInt16LE(0, 28);          // extra length

    // Chunked write to avoid allocating the 200 MB payload upfront.
    // NOTE: no position argument on the header write — positional writes
    // (pwrite) do not advance the file cursor, which would let the payload
    // overwrite the signature.
    const chunk = Buffer.alloc(1024 * 1024, 0xAB);
    let written = 30;
    fs.writeSync(fd, header, 0, 30);
    while (written < BYTES) {
        const n = Math.min(chunk.length, BYTES - written);
        fs.writeSync(fd, chunk, 0, n);
        written += n;
    }
    fs.closeSync(fd);
}

// --- Old approach: full-file read ---
function oldHeaderRead(zipPath) {
    const buffer = fs.readFileSync(zipPath);
    return buffer.subarray(0, 4);
}

// --- New approach: 4-byte header read ---
function newHeaderRead(zipPath) {
    const fd = fs.openSync(zipPath, 'r');
    try {
        const buffer = Buffer.alloc(4);
        fs.readSync(fd, buffer, 0, 4, 0);
        return buffer;
    } finally {
        fs.closeSync(fd);
    }
}

// --- Run ---
function main() {
    const filePath = path.join(os.tmpdir(), `gamehub-memory-check-${process.pid}.zip`);
    console.log(`Creating ${SIZE_MB} MB dummy ZIP at ${filePath} ...`);
    buildLargeZip(filePath);
    const fileStats = fs.statSync(filePath);
    console.log(`File size on disk: ${formatMB(fileStats.size)}\n`);

    // OLD approach
    const rssBeforeOld = measureRSS();
    const oldHeader = oldHeaderRead(filePath);
    const rssAfterOld = measureRSS();
    const oldDeltaBytes = rssAfterOld - rssBeforeOld;
    console.log('OLD approach (fs.readFileSync):');
    console.log(`  RSS before: ${formatMB(rssBeforeOld)}`);
    console.log(`  RSS after:  ${formatMB(rssAfterOld)}`);
    console.log(`  Δ RSS:      ${formatMB(oldDeltaBytes)}  (${oldDeltaBytes >= 0 ? '+' : ''}${oldDeltaBytes} bytes)`);
    console.log(`  Header:     ${oldHeader.toString('hex')}`);
    console.log(`  Expected:   504b0304\n`);

    // NEW approach
    const rssBeforeNew = measureRSS();
    const newHeader = newHeaderRead(filePath);
    const rssAfterNew = measureRSS();
    const newDeltaBytes = rssAfterNew - rssBeforeNew;
    console.log('NEW approach (fs.openSync + fs.readSync 4 bytes):');
    console.log(`  RSS before: ${formatMB(rssBeforeNew)}`);
    console.log(`  RSS after:  ${formatMB(rssAfterNew)}`);
    console.log(`  Δ RSS:      ${formatMB(newDeltaBytes)}  (${newDeltaBytes >= 0 ? '+' : ''}${newDeltaBytes} bytes)`);
    console.log(`  Header:     ${newHeader.toString('hex')}`);
    console.log(`  Expected:   504b0304\n`);

    const oldPeak = Math.max(0, oldDeltaBytes);
    const newPeak = Math.max(0, newDeltaBytes);
    const ratio = oldPeak > 0 && newPeak > 0 ? oldPeak / newPeak : 0;
    console.log(`Memory ratio (old/new): ~${ratio.toFixed(1)}x`);
    console.log(`\nResult: ${newDeltaBytes < BYTES / 2 ? 'PASS — memory does not scale with archive size' : 'FAIL — memory still scales with archive size'}`);

    // Cleanup
    fs.unlinkSync(filePath);
    console.log(`\nCleaned up ${filePath}`);

    process.exit(newDeltaBytes < BYTES / 2 ? 0 : 1);
}

main();