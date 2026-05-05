const path = require('node:path');
const express = require('express');
const nunjucks = require('nunjucks');

function createApp() {
  const app = express();

  const env = nunjucks.configure(path.join(__dirname, 'views'), {
    autoescape: true,
    express: app,
    noCache: process.env.NODE_ENV !== 'production'
  });
  app.set('view engine', 'njk');
  app.set('nunjucksEnv', env);

  app.use(express.urlencoded({ extended: false }));
  app.use(express.json({ limit: '1mb' }));
  app.use(express.static(path.join(__dirname, 'public')));

  app.get('/healthz', (req, res) => res.type('text').send('ok'));

  // Routes registered in later tasks.

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
  app.listen(PORT, HOST, () => {
    console.log(`Recipe box running at http://${HOST}:${PORT}`);
  });
}

module.exports = { createApp };
