# Technology Stack

**Analysis Date:** 2026-05-05

## Languages

**Primary:**
- JavaScript (Node.js) - Server-side application logic, utilities, route handlers
- Nunjucks templating - HTML views rendered server-side

**Secondary:**
- CSS - Static stylesheets (`public/styles.css`)
- HTML - Base markup in Nunjucks templates

## Runtime

**Environment:**
- Node.js v24.12.0 (or later compatible version)
- No build step; runs directly with Node

**Package Manager:**
- npm 8.19.2+
- Lockfile: `package-lock.json` (present)

## Frameworks

**Core:**
- Express.js 4.21.1 - HTTP web framework, routing, middleware
- Nunjucks 3.2.4 - Server-side template engine

**Frontend Interactivity:**
- HTMX 1.9.x (vendor library in `public/vendor/htmx.min.js`) - Enables dynamic DOM updates via AJAX

**Testing:**
- node:test (built-in Node.js test module) - Test runner

## Key Dependencies

**Critical:**
- express 4.21.1 - Core HTTP server and routing
- nunjucks 3.2.4 - Template rendering engine

**Note:** No production database drivers, ORM, authentication libraries, or external SDKs. All external I/O uses native Node.js fetch API (globalThis.fetch).

## Configuration

**Environment:**
- `HOST` env var - Server bind address (default: 127.0.0.1, use 0.0.0.0 for LAN access)
- `PORT` env var - Server port (default: 3003)
- `RECIPE_BOX_DATA_DIR` env var - Directory for JSON state file (default: `./data`)
- `NODE_ENV` env var - Controls template cache behavior (checked in `server.js:11`)

**Build:**
- None. No build configuration files present.

## Platform Requirements

**Development:**
- Node.js v24.12.0 or compatible
- npm 8.x+
- Access to `data/state.json` for reading/writing recipe state

**Production:**
- Node.js runtime (v24 or later recommended)
- systemd or process manager to keep the service running
- Writable filesystem for `data/state.json` and temp file rename atomicity
- Network access for URL scraping (fetch requests to recipe websites)

## Storage

**State Persistence:**
- JSON file-based: `data/state.json`
- Format: `{ recipes: [], weeks: [], grocery: [] }`
- Atomic writes via temp-file rename pattern (`state.json.tmp` → `state.json`)
- Location configurable via `RECIPE_BOX_DATA_DIR`

**Public Assets:**
- `public/styles.css` - CSS stylesheet
- `public/vendor/htmx.min.js` - HTMX library (52KB minified)

## Scripts

**Run Commands:**
- `npm start` - Start server on port 3003
- `npm run dev` - Start with auto-restart on file changes (node --watch)
- `npm run dev:lan` - Start bound to 0.0.0.0 for LAN access
- `npm test` - Run all test suites with node:test

---

*Stack analysis: 2026-05-05*
