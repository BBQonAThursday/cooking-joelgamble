const crypto = require('node:crypto');

// 10-char base36 hash of the URL, derived from the first 8 bytes of sha256.
// Stable across processes; collision-resistant enough for a personal recipe box.
function idForUrl(url) {
  const buf = crypto.createHash('sha256').update(String(url)).digest();
  // Take 8 bytes as a 64-bit unsigned int → base36, padded to 10 chars.
  const hi = BigInt('0x' + buf.subarray(0, 8).toString('hex'));
  return hi.toString(36).padStart(10, '0').slice(-10);
}

module.exports = { idForUrl };
