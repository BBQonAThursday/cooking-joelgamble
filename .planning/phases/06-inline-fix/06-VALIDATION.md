---
phase: 6
slug: inline-fix
status: draft
nyquist_compliant: false
wave_0_complete: false
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

> Populated by gsd-planner during PLAN.md generation. Each task in each plan should have an `<automated>` verify command pointing into the test files below, OR be marked as Wave 0 dependency for tests that need to land first.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | FIX-01..FIX-04 | — | N/A | http | TBD | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/library-categories-routes.test.js` — stubs for FIX-01, FIX-02, FIX-03 (categories-only Save endpoint, Categorize submission, GET fragment shapes, conflict 400 path)
- [ ] `test/grocery-routes.test.js` — extend with pencil-button presence assertions (matched + unmatched conditional `hx-get` target)
- [ ] `test/recipes-routes.test.js` — extend with pencil-button presence assertions on ingredient `<li>` (matched + unmatched conditional `hx-get` target) + FIX-04 invariant (recipe page never substitutes `entry.name` for `ingredient.text`)

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

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
