const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

let dataDir = null;

function setupDataDir() {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'recipe-box-test-'));
  process.env.RECIPE_BOX_DATA_DIR = dataDir;
}

function teardownDataDir() {
  delete process.env.RECIPE_BOX_DATA_DIR;
  if (dataDir && fs.existsSync(dataDir)) {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
  dataDir = null;
}

function getDataDir() {
  return dataDir;
}

async function startTestServer() {
  // Reset the storage singleton so the next storage.get() reloads from the
  // fresh RECIPE_BOX_DATA_DIR.
  require('../lib/storage')._resetForTest();

  const { createApp } = require('../server');
  const app = createApp();
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, port });
    });
  });
}

function stopTestServer(server) {
  return new Promise(resolve => server.close(() => resolve()));
}

function request(port, { method = 'GET', path = '/', body = null, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const data = body == null ? null
      : typeof body === 'string' ? body
      : new URLSearchParams(body).toString();
    const opts = {
      host: '127.0.0.1', port, method, path,
      headers: {
        ...(data ? {
          'content-type': 'application/x-www-form-urlencoded',
          'content-length': Buffer.byteLength(data)
        } : {}),
        ...headers
      }
    };
    const req = http.request(opts, res => {
      let chunks = '';
      res.on('data', d => { chunks += d; });
      res.on('end', () => resolve({ status: res.statusCode, body: chunks, headers: res.headers }));
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

module.exports = {
  setupDataDir, teardownDataDir, getDataDir,
  startTestServer, stopTestServer, request
};
