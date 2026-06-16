// Wires up "cloud mode": Google auth + per-user Postgres storage. Active only
// when GOOGLE_CLIENT_ID is set (i.e. deployed), so local dev and tests keep the
// file backend with no auth.
const als = require('./request-context');
const db = require('./db');
const auth = require('./auth');
const { runBackfill } = require('./backfill');

function installCloud(app) {
  auth.install(app); // sets req.userId for authenticated requests; gates the rest

  // For each authenticated request: load that user's state into the async
  // context, run a one-time library backfill if needed, and flush to Postgres
  // before the response is sent (only if something marked the state dirty).
  app.use(async (req, res, next) => {
    try {
      const state = await db.loadState(req.userId);
      let dirty = false;
      if (!state.libraryMigratedAt) {
        try {
          runBackfill(state); // stamps state.libraryMigratedAt
          dirty = true;
        } catch (err) {
          console.error('[backfill]', err.message);
        }
      }
      const ctx = { userId: req.userId, email: req.userEmail, state, get dirty() { return dirty; }, set dirty(v) { dirty = v; } };

      const originalSend = res.send.bind(res);
      let handled = false;
      res.send = function (body) {
        if (handled) return originalSend(body);
        handled = true;
        if (!ctx.dirty) return originalSend(body);
        db.saveState(ctx.userId, ctx.state, ctx.email)
          .then(() => originalSend(body))
          .catch((err) => {
            console.error('[persist]', err.message);
            originalSend(body);
          });
        return res;
      };

      als.run(ctx, () => next());
    } catch (err) {
      next(err);
    }
  });
}

module.exports = { installCloud };
