# External Integrations

**Analysis Date:** 2026-05-05

## APIs & External Services

**Recipe URL Scraper:**
- Service: User-provided URLs (arbitrary recipe websites)
- What it's used for: Fetch HTML pages and extract JSON-LD schema data
  - Implementation: `lib/scrape.js`
  - Client: Native Node.js `globalThis.fetch`
  - Timeout: 10 seconds per request
  - Max response size: 5MB
  - User-Agent: "Mozilla/5.0 (compatible; recipe-box/0.1)"

## Data Storage

**Databases:**
- None. No database integration.

**File Storage:**
- Local filesystem only
  - JSON state file: `data/state.json`
  - Directory configurable via `RECIPE_BOX_DATA_DIR` env var
  - Atomic writes via temp-file rename

**Caching:**
- None. No external caching layer.

## Authentication & Identity

**Auth Provider:**
- None. No authentication or identity provider.
- The app is personal/single-user with no access control.

## Monitoring & Observability

**Error Tracking:**
- None. No external error tracking service.

**Logs:**
- Console logging only
  - Server startup message logged to stdout
  - Errors logged to stderr (caught in Express error handler)

## CI/CD & Deployment

**Hosting:**
- Manual deployment to Raspberry Pi (systemd service)
- Runs as a sibling app with `home-hub`, `workout-log`, `planner-dashboard`
- Port 3003 picked up by `home-hub` dashboard

**CI Pipeline:**
- None. No automated CI/CD pipeline.

## Environment Configuration

**Optional env vars:**
- `HOST` - Server bind address (default: 127.0.0.1)
- `PORT` - Server port (default: 3003)
- `RECIPE_BOX_DATA_DIR` - State file directory (default: ./data)
- `NODE_ENV` - Controls Nunjucks template caching

**Secrets location:**
- No secrets required. App is read-only for external requests.

## Webhooks & Callbacks

**Incoming:**
- None. No webhook endpoints.

**Outgoing:**
- None. No outbound webhooks.

## Network Requirements

- **Outbound:** Fetch requests to recipe websites (HTTP/HTTPS)
  - Blocked by Cloudflare bot protection detected and reported to user
  - Non-HTML responses (content-type mismatch) rejected with user message
  - Network errors handled gracefully with user-friendly error toast

---

*Integration audit: 2026-05-05*
