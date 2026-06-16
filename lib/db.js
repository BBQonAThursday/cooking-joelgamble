// Postgres access via the Neon serverless driver (HTTP) — the same engine
// Netlify Database runs. Because the app runs as an Express function wrapped by
// serverless-http (Netlify "Lambda compatibility mode"), the connection string
// is supplied by us via env rather than auto-injected. We resolve it defensively.
const { neon } = require('@neondatabase/serverless');

const CANDIDATE_VARS = [
  'DATABASE_URL',
  'NETLIFY_DATABASE_URL',
  'NETLIFY_DATABASE_URL_UNPOOLED',
  'NETLIFY_DB_URL'
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

// Idempotent schema. Each entity is stored as a jsonb blob keyed by user, with
// an `ord` column so array order round-trips exactly. Cached per warm container.
let _schema = null;
function ensureSchema() {
  if (_schema) return _schema;
  const s = sql();
  _schema = (async () => {
    await s`create table if not exists profiles (user_id text primary key, email text, library_migrated_at text)`;
    await s`create table if not exists recipes (user_id text, id text, ord int, data jsonb, primary key (user_id, id))`;
    await s`create table if not exists weeks   (user_id text, week_start text, ord int, data jsonb, primary key (user_id, week_start))`;
    await s`create table if not exists grocery (user_id text, id text, ord int, data jsonb, primary key (user_id, id))`;
    await s`create table if not exists library (user_id text, id text, ord int, data jsonb, primary key (user_id, id))`;
  })();
  return _schema;
}

// Assemble the same state shape the rest of the app expects, scoped to one user.
async function loadState(userId) {
  await ensureSchema();
  const s = sql();
  const [recipes, weeks, grocery, library, profile] = await Promise.all([
    s`select data from recipes where user_id=${userId} order by ord`,
    s`select data from weeks   where user_id=${userId} order by ord`,
    s`select data from grocery where user_id=${userId} order by ord`,
    s`select data from library where user_id=${userId} order by ord`,
    s`select library_migrated_at from profiles where user_id=${userId}`
  ]);
  return {
    recipes: recipes.map((r) => r.data),
    weeks: weeks.map((r) => r.data),
    grocery: grocery.map((r) => r.data),
    library: library.map((r) => r.data),
    libraryMigratedAt: profile[0] ? profile[0].library_migrated_at : null
  };
}

// Whole-state replace for one user, in a single transaction. At this scale
// (tens of rows) delete+reinsert is simple and keeps the app's get/save model.
async function saveState(userId, state, email) {
  await ensureSchema();
  const s = sql();
  const q = [];
  q.push(s`delete from recipes where user_id=${userId}`);
  (state.recipes || []).forEach((r, i) =>
    q.push(s`insert into recipes (user_id, id, ord, data) values (${userId}, ${r.id}, ${i}, ${JSON.stringify(r)}::jsonb)`));
  q.push(s`delete from weeks where user_id=${userId}`);
  (state.weeks || []).forEach((w, i) =>
    q.push(s`insert into weeks (user_id, week_start, ord, data) values (${userId}, ${w.weekStart}, ${i}, ${JSON.stringify(w)}::jsonb)`));
  q.push(s`delete from grocery where user_id=${userId}`);
  (state.grocery || []).forEach((g, i) =>
    q.push(s`insert into grocery (user_id, id, ord, data) values (${userId}, ${g.id}, ${i}, ${JSON.stringify(g)}::jsonb)`));
  q.push(s`delete from library where user_id=${userId}`);
  (state.library || []).forEach((l, i) =>
    q.push(s`insert into library (user_id, id, ord, data) values (${userId}, ${l.id}, ${i}, ${JSON.stringify(l)}::jsonb)`));
  q.push(s`insert into profiles (user_id, email, library_migrated_at) values (${userId}, ${email || null}, ${state.libraryMigratedAt || null})
          on conflict (user_id) do update set email = coalesce(excluded.email, profiles.email), library_migrated_at = excluded.library_migrated_at`);
  await s.transaction(q);
}

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

module.exports = { sql, connectionString, connectionVar, ensureSchema, loadState, saveState, healthCheck };
