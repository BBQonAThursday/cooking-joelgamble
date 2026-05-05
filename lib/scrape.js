// Match <script ... type="application/ld+json" ...>...</script> with any
// attribute order and quote style. Per the JSON spec, ld+json bodies cannot
// contain raw </script>, so a non-greedy body match is safe.
const SCRIPT_RE = /<script\b[^>]*\btype\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

function extractJsonLdScripts(html) {
  if (typeof html !== 'string') return [];
  const out = [];
  let m;
  while ((m = SCRIPT_RE.exec(html)) !== null) {
    const body = m[1].trim();
    if (!body) continue;
    try {
      out.push(JSON.parse(body));
    } catch {
      // Skip malformed blocks; continue to the next match.
    }
  }
  return out;
}

module.exports = { extractJsonLdScripts };
