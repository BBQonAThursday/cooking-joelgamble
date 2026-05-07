---
phase: 6
slug: inline-fix
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-07
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test (built-in) |
| **Config file** | none — uses `node --test` glob |
| **Quick run command** | `node --test test/library-routes.test.js test/library-categories-routes.test.js` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run quick command (touched test files only)
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

> Populated by gsd-planner during PLAN.md generation. Each task in each plan has an `<automated>` verify command pointing into the test files below, OR is marked as a Wave 0 dependency for tests that need to land first.

| Task ID | Plan | Wave | Requirement | Threat Ref | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------|-------------------|-------------|--------|
| 06-01-01 | 01 | 1 | FIX-01, FIX-02 | — | template | `node -e "...icon-pencil.njk shape check..."` | ✅ | ⬜ pending |
| 06-01-02 | 01 | 1 | FIX-01 | T-06-01-01 | http | `node --test test/grocery-routes.test.js 2>&1 \| grep -E "^(ok\|not ok\|# pass\|# fail\|# tests)" \| tail -20` | ✅ | ⬜ pending |
| 06-01-03 | 01 | 1 | FIX-02, FIX-04 | T-06-01-01 | http | `node --test test/recipes.test.js 2>&1 \| grep -E "^(# pass\|# fail\|# tests)" \| tail -5` | ✅ | ⬜ pending |
| 06-02-01 | 02 | 2 | FIX-01, FIX-03 | T-06-02-01 | template | `node -e "...library-fix-editor.njk + library-categorize-editor.njk shape check..."` | ✅ | ⬜ pending |
| 06-02-02 | 02 | 2 | FIX-01, FIX-02, FIX-03 | T-06-02-01 | unit | `node -e "require('./routes/library')" && node --test test/calc.test.js && grep -c "router\.get\(\['\\\"]/library/categorize-edit" routes/library.js && grep -c "router\.get\(\['\\\"]/library/cancel-fix" routes/library.js && grep -c "router\.get\(\['\\\"]/library/:id/categories-edit" routes/library.js` | ✅ | ⬜ pending |
| 06-02-03 | 02 | 2 | FIX-01, FIX-02, FIX-03 | T-06-02-01 | http | `node --test test/library-categories-routes.test.js test/library-routes.test.js 2>&1 \| grep -E "^(# pass\|# fail\|# tests)" \| tail -5` | ✅ | ⬜ pending |
| 06-03-01 | 03 | 2 | FIX-01, FIX-02 | — | unit | `node -e "...20 CSS selector regex checks against public/styles.css..."` | ✅ | ⬜ pending |
| 06-04-01 | 04 | 3 | FIX-01, FIX-02, FIX-03 | T-06-04-01, T-06-04-03, T-06-04-05 | unit | `node -e "require('./routes/library')" && grep -c "router\.post" routes/library.js \| tr -d '\r\n'` | ✅ | ⬜ pending |
| 06-04-02 | 04 | 3 | FIX-01, FIX-02, FIX-03 | T-06-04-01, T-06-04-02, T-06-04-03 | http | `node --test test/library-categories-routes.test.js test/library-routes.test.js 2>&1 \| grep -E "^(# pass\|# fail\|# tests)" \| tail -5` | ✅ | ⬜ pending |
| 06-05-01 | 05 | 4 | FIX-01, FIX-02, FIX-03 | — | http | `node --test test/library-categories-routes.test.js 2>&1 \| grep -E "^(# pass\|# fail\|# tests)" \| tail -5` | ✅ | ⬜ pending |
| 06-05-02 | 05 | 4 | FIX-04 | — | http | `node --test test/grocery-routes.test.js 2>&1 \| grep -E "^(# pass\|# fail\|# tests)" \| tail -5` | ✅ | ⬜ pending |
| 06-05-03 | 05 | 4 | FIX-04 | — | http | `node --test test/recipes.test.js 2>&1 \| grep -E "^(# pass\|# fail\|# tests)" \| tail -5` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `test/library-categories-routes.test.js` — created in Plan 06-02 (Wave 2), populated by Plans 06-02 / 06-04 / 06-05
- [x] `test/grocery-routes.test.js` — extended in Plan 06-01 (Wave 1) with pencil-button assertions
- [x] `test/recipes.test.js` — extended in Plan 06-01 (Wave 1) with pencil-button assertions + FIX-04 invariant

*Wave 0 covers test scaffolding for the new endpoints + the per-surface OOB-shape assertions.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Pencil icon visual quality on multiple browsers | FIX-01, FIX-02 | SVG/Unicode rendering varies per platform; automated tests assert HTML presence only, not visual fidelity | Open `/grocery` and any `/recipes/:id` in Chrome, Firefox, Safari, Edge. Confirm pencil renders crisply at body-text size. |
| Editor open/close keyboard navigation | FIX-01, FIX-02 | DOM/aria assertions cover structure but not focus management | Tab to pencil button → Enter opens editor → Tab through dropdowns + Save/Cancel → Escape or Cancel closes editor → focus returns to pencil. |
| Mobile touch ergonomics | FIX-01, FIX-02 | Tap-target size and editor-takes-row layout need physical-device confirmation | Use Chrome devtools mobile emulation (iPhone + Pixel) on `/grocery`. Tap pencil → confirm editor expands inline, dropdowns are reachable, Save/Cancel buttons are tappable without overflow. |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 10s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-05-07
</content>
</invoke>