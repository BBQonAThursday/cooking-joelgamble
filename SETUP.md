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

## Step 2 — Create Netlify site + smoke-test deploy  ✅ DONE
- [x] Site created from `cooking-joelgamble`, building from `netlify.toml`
- [x] `RECIPE_BOX_DATA_DIR=/tmp` set
- [x] 🤖 Fixed first-deploy 500 (resolve views/public dirs in the bundled function)
- [x] ✅ Verified live: `/`, `/this-week`, `/grocery`, `/history`, `/library` all render 200

**My site URL:** `https://cooking-joelgamble.netlify.app`

---

## Step 3 — Provision Netlify Database (Neon Postgres)  🧑
> The project-level **Netlify Database** is the current product (the Neon *extension* is the deprecated beta). It requires the **credit-based plan** — that's why provisioning was blocked on the legacy free plan.
- [ ] **Billing → switch the account/team to the credit-based plan** (stays ~$0 within the free allowance; needs a payment method on file)
- [ ] Site dashboard → **Project configuration → Database** → **Add database / Get started** → accept defaults
- [ ] Confirm a `NETLIFY_DATABASE_URL` var now appears under **Site configuration → Environment variables**
  *(no secret to copy — Netlify injects it into the functions automatically)*
- [ ] 🤖 Claude then adds the Neon client, the schema migration, and the rewritten `storage.js`

---

## Step 4 — Sign in with Google (direct OAuth + cookie session)  🧑
> Not Netlify Identity: its function auth is Bearer-token based, which breaks on plain full-page navigations between tabs. Direct Google OAuth + a cookie session works for both navigations and HTMX posts.
- [ ] https://console.cloud.google.com → create/select a project
- [ ] **APIs & Services → OAuth consent screen** → **External** → app name `Cooking`, your support + developer email → scopes `openid`, `email`, `profile` → add the invited people as **Test users** (or Publish)
- [ ] **APIs & Services → Credentials → Create credentials → OAuth client ID → Web application:**
  - **Authorized redirect URIs:**
    `http://localhost:3003/auth/callback`, `https://cooking.joelgamble.io/auth/callback`
- [ ] Copy **Client ID** + **Client Secret**
- [ ] Generate a session secret: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- [ ] Add env vars in Netlify (**Site configuration → Environment variables**):
  - `GOOGLE_CLIENT_ID` = `…`
  - `GOOGLE_CLIENT_SECRET` = `…`
  - `SESSION_SECRET` = `…` *(the 64-char hex above)*
  - `BASE_URL` = `https://cooking.joelgamble.io`
  - `ALLOWED_EMAILS` = comma-separated allowlist of who may log in, e.g. `you@gmail.com,friend@gmail.com`
- [ ] 🤖 Claude then adds the Google OAuth flow + cookie-session login gate + profile/logout in nav

---

## Step 5 — Custom domain `cooking.joelgamble.io`  ✅ DONE
- [x] Domain added + DNS pointed
- [x] ✅ Verified live with TLS: `https://cooking.joelgamble.io/` renders 200

---

## Then — Claude builds (after Steps 3–4 exist)
- [ ] 🤖 Storage code: Postgres-backed `storage.js` (per-user via `AsyncLocalStorage`, no route changes) + schema migration
- [ ] 🤖 Auth code: Google OAuth flow + cookie-session login gate + profile/logout in nav, allowlisted by `ALLOWED_EMAILS`
- [ ] 🤖 One-time import of existing recipes from `home-hub/recipe-box/data/state.json` under your Google account
- [ ] 🤖 Update tests against a Neon test branch
- [ ] ✅ Verify: log in with Google → paste recipe URL → save → tag week → confirm → grocery → check off; second user sees an empty, isolated box

---

## Cost note
Effectively **$0** at this scale: Netlify DB free allowance (5 GB storage/writes/bandwidth, 1 compute unit), Functions free tier, and Google OAuth (free) comfortably cover a few users. Note the DB requires the **credit-based plan** with a payment method on file; storage is free until **July 1, 2026**, billed after — only matters if data grows large.
