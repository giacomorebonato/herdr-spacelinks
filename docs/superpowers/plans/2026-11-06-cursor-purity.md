# Cursor Purity (no row numbers in key mode) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retire every row-number affordance from key mode — digit keys, the `1..N open` footer hint, and the `N.` row labels — leaving the `›` cursor as the only way to name a link.

**Architecture:** Same single-file shape as the direct-delete change: `menuKey` stops mapping digits, `MenuAction` loses `{ op: 'open'; n }`, `keyFooter` loses the digit hint and `digitsHint`, `panelFrame` renders unnumbered rows. Line mode untouched.

**Tech Stack:** Bun runtime, strict TypeScript run directly, `node:test`-style suite via `bun test`.

**Spec:** `docs/superpowers/specs/2026-11-06-cursor-purity-design.md` (approved — user: "Proceed")

## Global Constraints

- Gates: `bun run typecheck` then `bun run test`. Bun only; never create `package-lock.json`; no build artifacts.
- Footer copy fixed verbatim: `'a add · q close'` / `'enter open · a add · d delete · q close'` / `'↑/↓ select · enter open · a add · d delete · q close'`.
- Line mode untouched: `parseCommand`, `LINE_FOOTER` (`'a — add · <n> — open · d <n> — delete · q — close'`), `lineDriver`, and scroll hints unchanged.
- Integration contract: a digit keypress with openable links produces no browser open, no `✗` error, and no state change.

## Review Focus

1. A stray digit (`9`) with links present must be a silent no-op — no open, no error, no state change → pinned in Task 1 (new integration test).
2. Deleting every link still works with only cursor keys → pinned in Task 1 (reworked errors-transient test uses `d`,`d`,`Enter`,`x` on two links).
3. Enter/open-selected, add, scroll hints, quit — regressions → existing retained tests (scrolling test, enter test, add tests) must stay green.
4. Line-mode `d <n>` / `<n>` piped fallback unchanged → existing `parseCommand` and line-mode integration tests untouched and green.
5. `↑ N above` / `↓ N below` hints survive the label removal → pinned in Task 1 (panelFrame scrolled case).

---

### Task 1: Retire digit keys, footer hint, and row labels

**Files:**
- Modify: `spacelinks.ts` (`MenuAction` ~47-53; `menuKey` ~340-351 + comment; `keyFooter` + `digitsHint` ~498-510; `panelFrame` row loop ~530-560; `keyDriver` open branch ~920)
- Test: `test/spacelinks.test.js`

**Interfaces:**
- Consumes: unchanged `ctx.open(n)` (still used by lineDriver), `ctx.remove`, `clampView`, scroll-hint logic.
- Produces: `MenuAction = delete-selected | move | add | quit | open-selected | noop`; `keyFooter(visibleCount)"; footer strings per Global Constraints; rows render `↳ title` with the `›` marker.

- [ ] **Step 1: Commit the spec + plan**

```bash
git add docs/superpowers/specs/2026-11-06-cursor-purity-design.md docs/superpowers/plans/2026-11-06-cursor-purity.md
git commit -m "docs: cursor-purity design and plan"
```

- [ ] **Step 2: Rewrite failing tests**

1. Unit `menuKey maps the single-state keymap`: change `sl.menuKey({ name: '3' })` expected value from `{ op: 'open', n: 3 }` to `{ op: 'noop' }` (comment: digits retired).
2. Unit `keyFooter only advertises actionable keys`: the 3-link case becomes `'↑/↓ select · enter open · a add · d delete · q close'` (drop `1..3 open`); 0/1 cases unchanged.
3. Unit `panelFrame renders cursor marker, scroll hints, honest footer`: add `assert.doesNotMatch(frame, /1\. ↳/);` (labels gone); scrolled/empty cases unchanged.
4. Integration: replace `key mode: errors are transient and d deletes the selected row in one keypress` — sequence `['d', 'd', '\r', 'x']` on links A,B; assert both `✓ deleted — ↳ A` and `✓ deleted — ↳ B` frames exist, the `✗ no links yet — press a to add` frame exists, the frame after it has no `✗` (transient), final state 0 links.
5. New integration test `key mode: digits no longer address rows`: drive `['9', 'q']` with one link; assert `opened` is empty, no `✗` in any frame, state still has 1 link.

- [ ] **Step 3: Run the suite to verify it fails**

Run: `bun test test/spacelinks.test.js`
Expected: FAIL on the Step-2 tests — `menuKey` returns `{op:'open',n:3}` for digits, footer still advertises `1..3 open`, rows still carry `N.` labels, the old errors-transient test shape no longer matches, digits test missing. Line-mode and add tests stay green.

- [ ] **Step 4: Implement in `spacelinks.ts`**

1. `MenuAction`: drop `| { op: 'open'; n: number }`.
2. `menuKey`: remove the digit-open branch; update the comment (cursor is the only selector; unknown keys — digits included — silent no-ops).
3. `keyDriver`: remove the `{ op: 'open' }` branch (the whole `if (act.op === 'open')` block opening `ctx.windowStart + act.n`).
4. `keyFooter`: drop the digit-hint push; delete the now-unused `digitsHint` helper.
5. `panelFrame`: drop `const digit = String(i + 1);` and render `const text = `↳ ${link.title}`;`.

- [ ] **Step 5: Gates green**

Run: `bun run typecheck` → clean. Run: `bun run test` → all pass.

- [ ] **Step 6: Commit**

```bash
git add spacelinks.ts test/spacelinks.test.js
git commit -m "feat: cursor is the only selector — retire digit row addressing"
```

---

### Task 2: README sync

**Files:**
- Modify: `README.md` (key table digit row; "rows are numbered" wording; footer-example sentence)

- [ ] **Step 1: Update the use section**

1. Remove the `| `1`–`9` | quick-open that row ... |` table row.
2. In the intro bullet, drop "rows are numbered and" (keep Ctrl-clickable).
3. In the footer paragraph, replace the `1..3 open when three links exist` example with the digit-free copy (the footer lists only what every key can act on: `↑/↓ select · enter open · a add · d delete · q close`).

- [ ] **Step 2: Verify no stale copy + gates**

Run: `grep -n 'quick-open\|1..3 open\|rows are numbered' README.md` → no key-mode matches (line-mode `<n>` mentions stay). Then `bun run typecheck` && `bun run test` → green.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: digit-free keymap in README"
```

---

## Post-plan integration (user-directed, not a task gate)

Merge into `main` locally, run gates on the merged result, push `main`, delete the feature branch. Executor ruling recorded in ledger: user opted out of a dispatched final review for this change ("skip reviewing") — careful self-check + green suite instead.
