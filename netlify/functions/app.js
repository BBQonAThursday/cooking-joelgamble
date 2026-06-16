// Netlify Function entrypoint: wraps the whole Express app as a single
// serverless function (Netlify's recommended pattern for Express apps).
// The catch-all redirect in netlify.toml routes every non-static request here;
// Express then does its own routing on the original path, unchanged.
const serverless = require('serverless-http');
const { createApp } = require('../../server');

module.exports.handler = serverless(createApp());
