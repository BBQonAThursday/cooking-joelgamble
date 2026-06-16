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

module.exports = { sql, connectionString, connectionVar, healthCheck };
