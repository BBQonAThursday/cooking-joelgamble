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

module.exports = { extractJsonLdScripts, findRecipeNode };
