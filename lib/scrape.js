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

function normalizeImage(img) {
  if (img == null) return null;
  if (typeof img === 'string') return img;
  if (Array.isArray(img)) {
    for (const item of img) {
      const n = normalizeImage(item);
      if (n) return n;
    }
    return null;
  }
  if (typeof img === 'object' && typeof img.url === 'string') return img.url;
  return null;
}

function normalizeYield(y) {
  if (y == null) return null;
  if (Array.isArray(y)) return y.length > 0 ? normalizeYield(y[0]) : null;
  const s = String(y).trim();
  return s.length > 0 ? s : null;
}

function totalMinutesFromNode(node) {
  const total = parseIsoDuration(node.totalTime);
  if (total !== null) return total;
  const prep = parseIsoDuration(node.prepTime);
  const cook = parseIsoDuration(node.cookTime);
  if (prep === null && cook === null) return null;
  return (prep || 0) + (cook || 0);
}

function trimOrEmpty(s) {
  return typeof s === 'string' ? s.trim() : '';
}

function normalizeRecipe(node, sourceUrl) {
  const ingredients = Array.isArray(node.recipeIngredient)
    ? node.recipeIngredient.map(s => (typeof s === 'string' ? s.trim() : '')).filter(Boolean)
    : [];
  return {
    sourceUrl,
    title: trimOrEmpty(node.name),
    description: trimOrEmpty(node.description),
    imageUrl: normalizeImage(node.image),
    servings: normalizeYield(node.recipeYield),
    totalMinutes: totalMinutesFromNode(node),
    ingredients,
    instructions: flattenInstructions(node.recipeInstructions)
  };
}

const MAX_BYTES = 5 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 10000;

function hostnameOf(url) {
  try { return new URL(url).hostname; } catch { return url; }
}

async function scrape(url, ctx) {
  const fetchFn = (ctx && ctx.fetch) || globalThis.fetch;
  let response;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      response = await fetchFn(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; recipe-box/0.1)',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9'
        }
      });
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    return { ok: false, reason: `Couldn't reach ${hostnameOf(url)}` };
  }

  if (!response.ok) {
    if (response.headers.get('cf-mitigated')) {
      return { ok: false, reason: `${hostnameOf(url)} blocked the request (Cloudflare bot protection)` };
    }
    return { ok: false, reason: `Got HTTP ${response.status} from ${hostnameOf(url)}` };
  }

  const ct = (response.headers.get('content-type') || '').toLowerCase();
  if (!ct.includes('text/html')) {
    return { ok: false, reason: `Page is not HTML (content-type ${ct || 'unknown'})` };
  }

  let html;
  try {
    html = await response.text();
  } catch (err) {
    return { ok: false, reason: `Couldn't read response from ${hostnameOf(url)}` };
  }

  if (html.length > MAX_BYTES) {
    return { ok: false, reason: `Page is too large (>${Math.round(MAX_BYTES/1024/1024)}MB)` };
  }

  const parsed = extractJsonLdScripts(html);
  if (parsed.length === 0) {
    return { ok: false, reason: 'No recipe data found on this page' };
  }
  const node = findRecipeNode(parsed);
  if (!node) {
    return { ok: false, reason: 'No recipe data found on this page' };
  }
  if (!node.name || typeof node.name !== 'string') {
    return { ok: false, reason: 'Recipe data has no title' };
  }
  return { ok: true, recipe: normalizeRecipe(node, url) };
}

module.exports = {
  extractJsonLdScripts, findRecipeNode, parseIsoDuration,
  flattenInstructions, normalizeRecipe, normalizeImage, normalizeYield,
  scrape
};
