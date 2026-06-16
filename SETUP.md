# cooking.joelgamble.io — Setup Checklist

Migration of `recipe-box` → standalone Netlify site at **cooking.joelgamble.io**, with **Netlify DB (Neon Postgres)** for storage and **Auth0** for per-person profiles (fully isolated data).

**Repo:** https://github.com/BBQonAThursday/cooking-joelgamble
**Local:** `C:\Users\jjoel\OneDrive\Desktop\Web Projects\cooking-joelgamble`

Legend: `[x]` done · `[ ]` to do · 🧑 = you (dashboard/login) · 🤖 = Claude (code)

---

## Step 1 — New repo + serverless wrap  ✅ DONE
- [x] 🤖 Clone recipe-box → sibling dir, detached from home-hub (home-hub left untouched)
- [x] 🤖 `netlify/functions/app.js` (serverless-http wrap of existing `createApp()`)
- [x] 🤖 `netlify.toml` (publish `public/`, route all else to the function, bundle `views/**`)
- [x] 🤖 Add deps `serverless-http` + `@netlify/functions`; 435/435 tests pass
- [x] 🤖 Commit + push to GitHub (`main`)

---

## Step 2 — Create Netlify site + smoke-test deploy  🧑
- [ ] https://app.netlify.com → **Add new site → Import an existing project** → connect GitHub → pick `cooking-joelgamble`
- [ ] Leave build settings as-is (Netlify reads `netlify.toml`) → **Deploy**
- [ ] **Site configuration → Environment variables → Add a variable:**
  - `RECIPE_BOX_DATA_DIR` = `/tmp`   *(app still writes a JSON file at this stage; Netlify FS is read-only except /tmp)*
  - `NODE_VERSION` = `20`   *(optional but recommended)*
- [ ] **Deploys → Trigger deploy → Deploy site**, then open the `https://<random>.netlify.app` URL
- [ ] ✅ Confirm the Recipes page renders + CSS/tabs load *(data won't persist yet — that's expected, DB replaces it in Step 4)*
- [ ] 📨 Send the `*.netlify.app` URL back to Claude

> If it 500s: **Deploys → (latest) → Functions → app** → copy the log to Claude.

**My site URL:** `__________________________.netlify.app`

---

## Step 3 — Provision Netlify DB (Neon Postgres)  🧑
- [ ] Site dashboard → **Project configuration → Database** (or **Extensions** → search Neon/Netlify DB) → **Add database / Get started**
- [ ] Accept defaults to provision
- [ ] Confirm a `NETLIFY_DATABASE_URL`-style var now appears under **Site configuration → Environment variables**
  *(no secret to copy — Netlify injects it into the functions automatically)*
- [ ] 🤖 Claude then adds `@netlify/database`, the schema migration, and the rewritten `storage.js`

---

## Step 4 — Auth0 (Regular Web Application)  🧑
- [ ] https://manage.auth0.com → log in. Note tenant domain: `__________.us.auth0.com`
- [ ] **Applications → Create Application** → name `Cooking` → **Regular Web Applications** → Create
- [ ] App **Settings** → set + Save:
  - **Allowed Callback URLs:**
    `http://localhost:3003/callback, https://<netlify-subdomain>.netlify.app/callback, https://cooking.joelgamble.io/callback`
  - **Allowed Logout URLs:**
    `http://localhost:3003, https://<netlify-subdomain>.netlify.app, https://cooking.joelgamble.io`
  - **Allowed Web Origins:** the same three origins (no `/callback`)
- [ ] Copy **Domain**, **Client ID**, **Client Secret**
- [ ] Keep it private: **Authentication → Database → Username-Password-Authentication → Settings → "Disable Sign Ups" = ON**
- [ ] Add the few users manually: **User Management → Users → Create User**
- [ ] Generate a cookie secret: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- [ ] Add env vars in Netlify (**Site configuration → Environment variables**):
  - `AUTH0_ISSUER_BASE_URL` = `https://your-tenant.us.auth0.com`
  - `AUTH0_CLIENT_ID` = `…`
  - `AUTH0_CLIENT_SECRET` = `…`
  - `AUTH0_SECRET` = `…` *(the 64-char hex above)*
  - `BASE_URL` = `https://cooking.joelgamble.io` *(use the `.netlify.app` URL until the custom domain is live)*
- [ ] 🤖 Claude then adds the `express-openid-connect` middleware + login gate

---

## Step 5 — Custom domain `cooking.joelgamble.io`  🧑 (can run in parallel)
- [ ] Netlify site → **Domain management → Add a domain** → `cooking.joelgamble.io`
- [ ] Point DNS:
  - If `joelgamble.io` already uses **Netlify DNS** → Netlify adds the record automatically; just confirm
  - If DNS is at registrar/Cloudflare → add **CNAME** `cooking` → `<netlify-subdomain>.netlify.app` (Cloudflare: **DNS only / grey cloud** so the cert can issue)
- [ ] Wait for DNS + auto TLS (Let's Encrypt); confirm `https://cooking.joelgamble.io` loads
- [ ] Update `BASE_URL` + Auth0 callback/logout URLs to the real domain

---

## Then — Claude builds (after Steps 2–4 exist)
- [ ] 🤖 Step 3 code: Postgres-backed `storage.js` (per-user via `AsyncLocalStorage`, no route changes) + schema migration
- [ ] 🤖 Step 4 code: Auth0 `express-openid-connect` middleware + profile/logout in nav
- [ ] 🤖 One-time import of existing recipes from `home-hub/recipe-box/data/state.json` under your Auth0 user
- [ ] 🤖 Update tests against a Neon test branch
- [ ] ✅ Verify: log in → paste recipe URL → save → tag week → confirm → grocery → check off; second user sees an empty, isolated box

---

## Cost note
Effectively **$0** at this scale: Netlify DB free allowance (5 GB storage/writes/bandwidth, 1 compute unit), Functions free tier, Auth0 free tier all comfortably cover a few users. Storage is free until **July 1, 2026**, billed after — only matters if data grows large.
