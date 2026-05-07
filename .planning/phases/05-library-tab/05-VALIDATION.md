---
phase: 5
slug: library-tab
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-07
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: `.planning/phases/05-library-tab/05-RESEARCH.md` §"Validation Architecture".

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test (built-in, Node 24.12.0) |
| **Config file** | none — runs via `node --test test/*.test.js` |
| **Quick run command** | `node --test test/calc.test.js` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~3 seconds (full); <1s (unit only) |

---

## Sampling Rate

- **After every task commit:** Run `node --test test/calc.test.js` (unit, fast)
- **After every plan wave:** Run `node --test test/library-routes.test.js test/calc.test.js`
- **Before `/gsd-verify-work`:** `npm test` must be green
- **Max feedback latency:** 3 seconds

---

## Per-Task Verification Map

> Filled in by the planner from each PLAN.md `validation.required` block. Wave 0 plan creates the test files referenced below.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 5-00-01 | 00 | 0 | LIB-* | — | n/a | scaffold | `test -f test/library-routes.test.js` | ❌ W0 | ⬜ pending |
| 5-01-* | 01 | 1 | LIB-02, LIB-03 | T-V5 | input validation | unit | `node --test test/calc.test.js` | ✅ (extend) | ⬜ pending |
| 5-02-* | 02 | 2 | LIB-02 | — | n/a | http | `node --test test/library-routes.test.js` | ✅ W0 | ⬜ pending |
| 5-03-* | 03 | 2 | LIB-04 | T-V5 | name maxlength 200 | http | `node --test test/library-routes.test.js` | ✅ W0 | ⬜ pending |
| 5-04-* | 04 | 3 | LIB-05 | T-V5 | aliasConflict; category enum; HTMX 4xx swap | http | `node --test test/library-routes.test.js` | ✅ W0 | ⬜ pending |
| 5-05-* | 05 | 4 | LIB-06 | T-V5 | recipes unmutated; per-row recipe-count | http | `node --test test/library-routes.test.js` | ✅ W0 | ⬜ pending |
| 5-06-* | 06 | 5 | LIB-01 | — | atomic-tab-launch (final wave) | http | `npm test` | ✅ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command |
|--------|----------|-----------|-------------------|
| LIB-01 | Library tab appears in nav (final-wave atomic launch) | HTTP smoke | `node --test test/library-routes.test.js` |
| LIB-02 | GET /library renders; filter buttons; search narrows | HTTP integration | `node --test test/library-routes.test.js` |
| LIB-02 | Search + filter AND combination | Unit | `node --test test/calc.test.js` |
| LIB-03 | Row shows name, aliases, categories, badges | HTTP integration | `node --test test/library-routes.test.js` |
| LIB-03 | recipeCount + unused computed at render time | Unit | `node --test test/calc.test.js` |
| LIB-04 | POST /library creates entry with curated:true | HTTP integration | `node --test test/library-routes.test.js` |
| LIB-04 | POST /library 400 on missing name | HTTP smoke | `node --test test/library-routes.test.js` |
| LIB-05 | GET /library/:id/edit returns edit-form fragment | HTTP smoke | `node --test test/library-routes.test.js` |
| LIB-05 | POST /library/:id saves and returns read-only row + OOB footer | HTTP smoke | `node --test test/library-routes.test.js` |
| LIB-05 | POST /library/:id 400 on alias conflict (fragment returned) | HTTP integration | `node --test test/library-routes.test.js` |
| LIB-05 | Cancel via GET /library/:id returns read-only row | HTTP smoke | `node --test test/library-routes.test.js` |
| LIB-05 | Save sets curated:true on previously uncurated entry | HTTP integration | `node --test test/library-routes.test.js` |
| LIB-06 | POST /library/:id/delete removes entry; state.recipes unchanged | HTTP integration | `node --test test/library-routes.test.js` |
| LIB-06 | Delete 404 for unknown id | HTTP smoke | `node --test test/library-routes.test.js` |
| LIB-06 | Footer unused-count OOB included in delete response | HTTP smoke | `node --test test/library-routes.test.js` |

---

## Wave 0 Requirements

- [ ] `test/library-routes.test.js` — stubs for LIB-01 through LIB-06 (HTTP layer; uses `helpers.setupDataDir + startTestServer`)
- [ ] `test/calc.test.js` — extension block for `buildLibraryView` (no new file; adds describe-block to existing)
- [ ] `views/partials/library-footer.njk` — referenced by Wave 1 OOB swaps
- [ ] HTMX 4xx swap config: `<meta name="htmx-config">` in `views/layout.njk` to allow alias-conflict 400 to swap (per RESEARCH §HTMX Pitfall)

*Frameworks already installed (node:test built-in). No npm install required.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live-debounce search feel (300ms) | LIB-02 / D-57 | timing-sensitive UX, browser-only | Type "g-a-r" rapidly into search; verify single request fires after 300ms idle (DevTools Network tab) |
| Browser back/forward restores `?q=&filter=` state | LIB-02 / D-58 | requires history navigation | Search "garlic", click filter Uncurated, press back twice — verify URL + UI restore |
| `hx-confirm` native dialog copy varies by recipe-count | LIB-06 / D-65 | browser-only `confirm()` | Click delete on entry with 0 recipes; click delete on entry used in 4 recipes — verify text matches D-65 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (test files + footer partial + meta-tag)
- [ ] No watch-mode flags
- [ ] Feedback latency < 3s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
