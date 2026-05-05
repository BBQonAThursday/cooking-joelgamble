const { buildView } = require('./calc');
const storage = require('./storage');

function renderFragments(req, res, parts) {
  const view = buildView(storage.get());
  const html = parts.map(({ template, mode, extra }) => {
    const ctx = { ...view, ...(extra || {}) };
    const out = renderSync(req, template, ctx);
    return mode === 'oob' ? injectOob(out) : out;
  }).join('\n');
  res.type('html').send(html);
}

function renderSync(req, template, ctx) {
  const env = req.app.get('nunjucksEnv');
  return env.render(template, ctx);
}

function injectOob(html) {
  const trimmed = html.trimStart();
  return trimmed.replace(/^<([a-zA-Z][\w-]*)([^>]*)>/, (m, tag, attrs) => {
    if (/\bhx-swap-oob=/.test(attrs)) return m;
    return `<${tag}${attrs} hx-swap-oob="true">`;
  });
}

function respondWithUpdates(req, res, { panels = [], extra = {} } = {}) {
  const parts = [];
  for (const template of panels) parts.push({ template, mode: 'oob', extra });
  renderFragments(req, res, parts);
}

module.exports = { renderFragments, respondWithUpdates, injectOob };
