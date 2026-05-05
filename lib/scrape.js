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

function isRecipeNode(node) {
  if (!node || typeof node !== 'object') return false;
  const t = node['@type'];
  return t === 'Recipe' || (Array.isArray(t) && t.includes('Recipe'));
}

function findRecipeNode(parsedList) {
  for (const item of parsedList || []) {
    const found = walk(item);
    if (found) return found;
  }
  return null;
}

function walk(node) {
  if (!node) return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = walk(child);
      if (found) return found;
    }
    return null;
  }
  if (typeof node !== 'object') return null;
  if (isRecipeNode(node)) return node;
  if (Array.isArray(node['@graph'])) {
    for (const child of node['@graph']) {
      const found = walk(child);
      if (found) return found;
    }
  }
  return null;
}

// Subset of ISO 8601 duration: PT[XH][YM][ZS]. Returns whole minutes (seconds
// floored away). Returns null if the input doesn't match.
function parseIsoDuration(s) {
  if (typeof s !== 'string') return null;
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(s);
  if (!m) return null;
  const h = m[1] ? parseInt(m[1], 10) : 0;
  const min = m[2] ? parseInt(m[2], 10) : 0;
  // m[3] (seconds) intentionally dropped.
  if (!m[1] && !m[2] && !m[3]) return null; // bare "PT"
  return h * 60 + min;
}

function flattenInstructions(input) {
  const out = [];
  walkInstr(input, out);
  return out
    .map(s => (typeof s === 'string' ? s.trim() : ''))
    .filter(s => s.length > 0);
}

function walkInstr(node, out) {
  if (node == null) return;
  if (typeof node === 'string') {
    out.push(node);
    return;
  }
  if (Array.isArray(node)) {
    for (const child of node) walkInstr(child, out);
    return;
  }
  if (typeof node !== 'object') return;
  if (node['@type'] === 'HowToSection' && Array.isArray(node.itemListElement)) {
    walkInstr(node.itemListElement, out);
    return;
  }
  if (node['@type'] === 'HowToStep' && typeof node.text === 'string') {
    out.push(node.text);
    return;
  }
  // Unrecognized object: ignore.
}

module.exports = { extractJsonLdScripts, findRecipeNode, parseIsoDuration, flattenInstructions };
