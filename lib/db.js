// Postgres access via the Neon serverless driver (HTTP) — the same engine
// Netlify Database runs. Netlify injects the connection string under one of a
// few possible env var names depending on product version; resolve defensively
// rather than hardcoding one, and report which one we found (never the value).
const { neon } = require('@neondatabase/serverless');

const CANDIDATE_VARS = [
  'NETLIFY_DATABASE_URL',
  'NETLIFY_DATABASE_URL_UNPOOLED',
  'NETLIFY_DB_URL',
  'DATABASE_URL'
];

function connectionVar() {
  return CANDIDATE_VARS.find((v) => process.env[v]) || null;
}

function connectionString() {
  const v = connectionVar();
  return v ? process.env[v] : null;
}

let _sql = null;
function sql() {
  if (_sql) return _sql;
  const cs = connectionString();
  if (!cs) throw new Error('No database connection string env var found');
  _sql = neon(cs);
  return _sql;
}

// Safe to expose: returns connectivity status and the NAME of the env var used
// (not its value) plus any error message. Used by GET /healthz/db.
async function healthCheck() {
  const v = connectionVar();
  if (!v) return { ok: false, varFound: null, error: 'no connection string env var found' };
  try {
    const rows = await sql()`select 1 as ok`;
    return { ok: rows[0] && Number(rows[0].ok) === 1, varFound: v };
  } catch (err) {
    return { ok: false, varFound: v, error: err.message };
  }
}

// Temporary diagnostic: reveal which DB-related env var NAMES exist (names only,
// never values) and whether Netlify's own @netlify/database package can resolve
// a connection. Lets us discover how this site actually exposes the database.
async function diagnostics() {
  const pattern = /(DATABASE|NEON|POSTGRES|NETLIFY_DB|_DB_URL|^PG[A-Z]*$)/i;
  const envKeys = Object.keys(process.env).filter((k) => pattern.test(k)).sort();
  const direct = await healthCheck();

  let netlifyDb;
  try {
    const mod = await import('@netlify/database');
    netlifyDb = { tried: true, exports: Object.keys(mod) };
    if (typeof mod.getConnectionString === 'function') {
      try {
        netlifyDb.gotConnectionString = !!mod.getConnectionString();
      } catch (e) {
        netlifyDb.getConnectionStringError = e.message;
      }
    }
  } catch (err) {
    netlifyDb = { tried: true, error: err.message };
  }

  return { direct, envKeys, netlifyDb };
}

module.exports = { sql, connectionString, connectionVar, healthCheck, diagnostics };
