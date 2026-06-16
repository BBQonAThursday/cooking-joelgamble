const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const nunjucks = require('nunjucks');

// Resolve views/ and public/ robustly. Locally __dirname is the repo root, but
// inside a bundled Netlify Function esbuild rewrites __dirname while the
// included files land at the task root (process.cwd()). Pick the first that exists.
function resolveDir(name) {
  const candidates = [
    path.join(__dirname, name),
    path.join(process.cwd(), name),
    path.join(__dirname, '..', '..', name)
  ];
  return candidates.find(p => fs.existsSync(p)) || candidates[0];
}

function createApp() {
  const app = express();

  const env = nunjucks.configure(resolveDir('views'), {
    autoescape: true,
    express: app,
    noCache: process.env.NODE_ENV !== 'production'
  });
  app.set('view engine', 'njk');
  app.set('nunjucksEnv', env);

  app.use(express.urlencoded({ extended: false }));
  app.use(express.json({ limit: '1mb' }));
  app.use(express.static(resolveDir('public')));

  app.get('/healthz', (req, res) => res.type('text').send('ok'));

  // DB connectivity probe — reports ok + which env var held the connection
  // string (never the value). Public (registered before the auth gate).
  app.get('/healthz/db', async (req, res) => {
    try {
      const db = require('./lib/db');
      res.type('json').send(JSON.stringify(await db.healthCheck()));
    } catch (err) {
      res.status(500).type('json').send(JSON.stringify({ ok: false, error: err.message }));
    }
  });

  // Cloud mode: Google auth + per-user Postgres. Enabled only when configured
  // (deployed); local dev and tests run unauthenticated on the file backend.
  // Installed here so /healthz* stay public but all app routes below are gated.
  if (process.env.GOOGLE_CLIENT_ID) {
    require('./lib/cloud').installCloud(app);
  }

  app.use('/', require('./routes/recipes'));
  app.use('/', require('./routes/weeks'));
  app.use('/', require('./routes/grocery'));
  app.use('/', require('./routes/history'));
  app.use('/', require('./routes/library'));

  const storage = require('./lib/storage');
  const { buildView } = require('./lib/calc');
  app.get('/', (req, res) => {
    res.render('index.njk', buildView(storage.get(), new Date()));
  });

  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).type('text').send('Server error: ' + err.message);
  });

  return app;
}

if (require.main === module) {
  const app = createApp();
  const HOST = process.env.HOST || '127.0.0.1';
  const PORT = parseInt(process.env.PORT, 10) || 3003;

  // [PHASE 4 EXTR-03] Auto-extract & backfill: synchronous, before app.listen.
  // SC#5 satisfied structurally: no listener bound until backfill completes (D-44).
  const storage = require('./lib/storage');
  const { runBackfill } = require('./lib/backfill');
  const state = storage.get();
  const result = runBackfill(state);
  if (!result.alreadyRan) {
    storage.save();
    console.log(`Backfilled ${result.added.length} library entries from ${state.recipes.length} recipes`);
  }

  app.listen(PORT, HOST, () => {
    console.log(`Recipe box running at http://${HOST}:${PORT}`);
  });
}

module.exports = { createApp };
