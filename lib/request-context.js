// Per-request store so storage.get()/save() can stay synchronous and
// argument-free while operating on the logged-in user's state. In cloud mode the
// middleware loads the user's state into this context; outside it (local dev,
// tests) there is no context and storage falls back to its file backend.
const { AsyncLocalStorage } = require('node:async_hooks');

module.exports = new AsyncLocalStorage();
