'use strict';

// Backfill script: re-scrapes existing recipes to populate recipe.ingredientSections
// from WPRM HTML. Idempotent: re-running recomputes and overwrites the field without
// touching title, ingredients, instructions, or any other recipe data.
//
// Usage: node scripts/backfill-ingredient-sections.js
// Or via npm: npm run backfill:sections
//
// The live network path is guarded by `require.main === module` so the module
// can be unit-tested with injected fetch/sleep without hitting the network.

const scrapeMod = require('../lib/scrape');
const storage = require('../lib/storage');

// Reuse the same request settings as lib/scrape.js#scrape to match what the
// original scrape used: same User-Agent, Accept, timeout.
const FETCH_TIMEOUT_MS = 10000;
const SLEEP_MS = 500;

function hostnameOf(url) {
  try { return new URL(url).hostname; } catch { return String(url); }
}

// Fetch a single recipe's page and update recipe.ingredientSections in place.
// fetchFn is injected for testability; defaults to globalThis.fetch.
// Returns a report object: { host, status, count, headings, reason }.
async function backfillRecipe(recipe, { fetchFn } = {}) {
  const fetch = fetchFn || globalThis.fetch;
  const host = hostnameOf(recipe.sourceUrl);

  let response;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      response = await fetch(recipe.sourceUrl, {
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
    return { host, status: 'failed', count: 0, headings: [], reason: String(err.message || err) };
  }

  if (!response.ok) {
    return { host, status: 'failed', count: 0, headings: [], reason: 'HTTP ' + response.status };
  }

  let html;
  try {
    html = await response.text();
  } catch (err) {
    return { host, status: 'failed', count: 0, headings: [], reason: 'read error: ' + String(err.message || err) };
  }

  let sections;
  try {
    sections = scrapeMod.parseIngredientSections(html);
  } catch (err) {
    return { host, status: 'failed', count: 0, headings: [], reason: 'parse error: ' + String(err.message || err) };
  }

  // Additive: only set ingredientSections; leave all other fields untouched.
  recipe.ingredientSections = sections;

  if (sections.length > 0) {
    const headings = sections.map(s => s.heading || '(unnamed)');
    return { host, status: 'sections', count: sections.length, headings, reason: null };
  }
  return { host, status: 'flat', count: 0, headings: [], reason: null };
}

// Process all recipes in state, saving once at the end.
// sleepFn is injected for testability; defaults to a real 500ms pause.
async function backfillAll(state, { fetchFn, sleepFn } = {}) {
  const sleep = sleepFn || (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const recipes = (state && state.recipes) || storage.get().recipes;
  const reports = [];

  for (let i = 0; i < recipes.length; i++) {
    const recipe = recipes[i];
    let report;
    try {
      report = await backfillRecipe(recipe, { fetchFn });
    } catch (err) {
      // Belt-and-suspenders: backfillRecipe should never throw, but guard anyway.
      report = {
        host: hostnameOf(recipe.sourceUrl),
        status: 'failed',
        count: 0,
        headings: [],
        reason: String(err.message || err)
      };
    }
    reports.push(report);

    // ASCII-only console output (CLAUDE.md HTTP-header constraint applies to
    // toast strings; we apply the same spirit to console output for consistency).
    if (report.status === 'sections') {
      console.log(report.host + ' - ' + report.count + ' sections: ' + report.headings.join(', '));
    } else if (report.status === 'flat') {
      console.log(report.host + ' - flat (no groups)');
    } else {
      console.log(report.host + ' - FETCH FAILED: ' + report.reason);
    }

    // Throttle between requests (skip after last recipe).
    if (i < recipes.length - 1) {
      await sleep(SLEEP_MS);
    }
  }

  // Persist once after all updates.
  storage.save();

  return reports;
}

module.exports = { backfillRecipe, backfillAll };

// Live run: only when invoked directly as `node scripts/backfill-ingredient-sections.js`.
if (require.main === module) {
  (async () => {
    const state = storage.get();
    console.log('Backfilling ingredientSections for ' + state.recipes.length + ' recipe(s)...');
    await backfillAll(state);
    console.log('Done.');
  })().catch(err => {
    console.error('Backfill failed:', err.message || err);
    process.exit(1);
  });
}
