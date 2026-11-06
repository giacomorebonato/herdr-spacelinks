# Direct Delete (`d` = delete the selected row) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In key mode, `d` deletes the `›`-selected link in one keypress; the delete-arming state machine (`d` → digit/Enter → delete) is removed entirely.

**Architecture:** Single-file change in `spacelinks.ts`: `menuKey` becomes a single-state function (no `armed` param), `MenuAction` drops the key-mode `arm`/`delete`/`disarm` ops, and the armed branches in `keyFooter`, `panelFrame`, `PanelCtx`, and `keyDriver` are deleted. Line mode is untouched.

**Tech Stack:** Bun (package manager + runtime), strict TypeScript run directly by Bun, tests in `test/spacelinks.test.js` (`node:test` style under `bun test`).

**Spec:** `docs/superpowers/specs/2026-11-06-direct-delete-design.md` (approved)

## Global Constraints

- Bun only: `bun run typecheck` (runs `bun check`) and `bun run test` (runs `bun test test/spacelinks.test.js`) are the gates. Never create `package-lock.json`; no build step or compiled artifact (`herdr-plugin.toml` runs `bun spacelinks.ts <subcommand>`).
- Strict TypeScript: discriminated unions, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` — the union change must typecheck clean.
- Footer copy is fixed verbatim: `'a add · q close'`, `'enter open · a add · d delete · q close'`, `'↑/↓ select · enter open · 1..3 open · a add · d delete · q close'`.
- Line mode is out of scope: `parseCommand` (`d <n>`, absolute indexing for legacy >9-link states) and `LINE_FOOTER` (`'a — add · <n> — open · d <n> — delete · q — close'`) must not change.
- Historical specs in `docs/superpowers/` are never rewritten; the new spec/plan docs are already dated files.

## Review Focus

1. Deleting the last row then immediately pressing `d` again — cursor/window must clamp with no crash, second delete removes the new last row. → pinned in Task 1 (double-delete integration assertions).
2. `d` on an empty list (reached by cancelling the add form) — must show `✗ no links yet — press a to add`, same message Enter uses, never an internal-looking error. → pinned in Task 1 (empty-list integration test).
3. Digits keep open-only semantics now that `d` is no longer a prefix — `1..9` open the visible-window row, out-of-range digit stays a gentle error. → pinned in Task 1 (existing `'9'` error test + menuKey digit assertions).
4. Esc / Ctrl+C / Ctrl+D quit from any state (no disarm trap); Ctrl+C/D remain the EOF-quit convention. → pinned in Task 1 (menuKey unit tests; integration suites end on a single `q`).
5. Line-mode `d <n>` regression (legacy >9 addressing) — existing `parseCommand(' d 12 ')` test must keep passing. → watch the Task 1 gates; no new test needed.

---

### Task 1: Single-state key mode — one-keypress delete

**Files:**
- Modify: `spacelinks.ts:47-56` (`MenuAction`), `115-117` (`PanelFrameOptions`), `129-133` (`PanelCtx.armed`), `349-367` (`menuKey` + comment), `519-523` (`keyFooter`), `530-566` (`panelFrame`), `620` (`createPanelCtx` init), `625` (`render` opts), `898-905` (`keyDriver` armed handling), `930-937` (`delete`/`delete-selected` branches)
- Test: `test/spacelinks.test.js` (blocks at lines 80-101, 104-110, 243-247, 269-289, 384-386 comment, 394-422)

**Interfaces:**
- Consumes: existing `ctx.remove(n)`, `ctx.links()`, `ctx.open(n)`, `clampView` — all unchanged.
- Produces (Task 2 and the README rely on the behavior, not the signatures):
  - `menuKey(key: KeyLike | null | undefined): MenuAction` — single parameter, single state.
  - `keyFooter(visibleCount: number): string`.
  - `MenuAction = { op: 'open'; n } | { op: 'delete-selected' } | { op: 'move'; delta } | { op: 'add' } | { op: 'quit' } | { op: 'open-selected' } | { op: 'noop' }` — no `arm`, no `delete`, no `disarm`.
  - Empty-list delete message: `no links yet — press a to add`.

- [ ] **Step 1: Commit the approved spec + this plan**

```bash
git add docs/superpowers/specs/2026-11-06-direct-delete-design.md docs/superpowers/plans/2026-11-06-direct-delete.md
git commit -m "docs: direct-delete design and plan"
```

- [ ] **Step 2: Rewrite the unit tests (failing)**

In `test/spacelinks.test.js` replace the `menuKey maps the cursor-model keymap` block (lines 80-101) with a single-state keymap — old content stays except `d` now deletes and every `menuKey(true, …)` armed case disappears:

```js
test('menuKey maps the single-state keymap', () => {
  assert.deepEqual(sl.menuKey({ name: 'a' }), { op: 'add' });
  assert.deepEqual(sl.menuKey({ name: 'A', shift: true }), { op: 'add' });
  assert.deepEqual(sl.menuKey({ name: 'd' }), { op: 'delete-selected' });
  assert.deepEqual(sl.menuKey({ name: '3' }), { op: 'open', n: 3 });
  assert.deepEqual(sl.menuKey({ name: 'q' }), { op: 'quit' });
  assert.deepEqual(sl.menuKey({ name: 'escape' }), { op: 'quit' });
  assert.deepEqual(sl.menuKey({ name: 'c', ctrl: true }), { op: 'quit' });
  assert.deepEqual(sl.menuKey({ name: 'up' }), { op: 'move', delta: -1 });
  assert.deepEqual(sl.menuKey({ name: 'k' }), { op: 'move', delta: -1 });
  assert.deepEqual(sl.menuKey({ name: 'down' }), { op: 'move', delta: 1 });
  assert.deepEqual(sl.menuKey({ name: 'j' }), { op: 'move', delta: 1 });
  assert.deepEqual(sl.menuKey({ name: 'return' }), { op: 'open-selected' });
  assert.deepEqual(sl.menuKey({ name: 'enter' }), { op: 'open-selected' });
  assert.deepEqual(sl.menuKey({ name: 'x' }), { op: 'noop' });
  assert.deepEqual(sl.menuKey(null), { op: 'noop' });
});
```

Replace the `keyFooter` block (lines 104-110) with the single-argument call:

```js
test('keyFooter only advertises actionable keys', () => {
  assert.equal(sl.keyFooter(0), 'a add · q close');
  assert.equal(sl.keyFooter(1), 'enter open · a add · d delete · q close');
  assert.equal(sl.keyFooter(3), '↑/↓ select · enter open · 1..3 open · a add · d delete · q close');
});
```

Replace the `panelFrame` block (lines 269-289): same fixture and scrolled/empty cases, but without `armed: true` — drop the `delete which?`, `\x1b[7m1\x1b[27m`, `\x1b[7m2\x1b[27m` assertions and add `assert.doesNotMatch(frame, /delete which/);` and `assert.doesNotMatch(frame, /\x1b\[7m/);` to pin that armed rendering is gone.

Replace the chords test block (lines 305-311), dropping the armed case:

```js
test('menuKey: modified chords never act as bare letters', () => {
  assert.deepEqual(sl.menuKey({ name: 'd', ctrl: true }), { op: 'quit' }); // EOF convention
  assert.deepEqual(sl.menuKey({ name: 'a', ctrl: true }), { op: 'noop' });
  assert.deepEqual(sl.menuKey({ name: 'q', meta: true }), { op: 'noop' });
  assert.deepEqual(sl.menuKey({ name: 'c', ctrl: true }), { op: 'quit' });
});
```

- [ ] **Step 3: Rewrite the integration tests (failing)**

Update the `drivePanel` closing comment (lines 384-386): a single `'q'` quits now; the extra write just sits in the buffer.

Replace `key mode: errors are transient, footer is honest, armed digits highlighted` (lines 394-407) with — pins that `d` deletes the cursor row with no second key:

```js
test('key mode: errors are transient and d deletes the selected row in one keypress', async () => {
  const d = tmp();
  const { frames } = await drivePanel(d, ['9', 'd'], {
    links: [{ title: 'A', url: 'https://a.dev' }],
  });
  const errored = frames.find((f) => f.includes('✗ no link 9'));
  assert.ok(errored, 'out-of-range digit shows a gentle error');
  const cleared = frames[frames.indexOf(errored) + 1];
  assert.doesNotMatch(cleared, /no link 9/);   // error cleared by the next key
  assert.match(cleared, /✓ deleted — ↳ A/);    // d acted on the cursor row directly
  assert.match(cleared, /\(none yet\)/);       // list is empty: no second key needed
  assert.equal(sl.readState(d).w1.links.length, 0);
});
```

In `key mode: unknown keys are silent, status clears on next key` (lines 410-425), change the key sequence from `['x', 'd', '2', 'j']` to `['x', 'j', 'd', 'j']` and the comment `digit 2 deleted the second row` to `›-selected row deleted` — all other assertions stay.

In `key mode: scrolling makes legacy >9 links reachable and deletable` (lines 434-457), change the second drive of the test from `[...Array(11).fill('j'), 'd', '9']` (armed digit) to navigate-then-`d`, plus a double-delete clamp at the end of the list:

```js
  const d2 = tmp();
  const r2 = await drivePanel(d2, [...Array(11).fill('j'), 'd'], { links: twelve });
  const r3 = await drivePanel(d3, [...Array(11).fill('j'), 'd', 'd'], { links: twelve });
```

`d2` keeps its existing assertions (`t11` deleted, `✓ deleted — ↳ t11`); `r3` declares `const d3 = tmp();` at its first use and adds:

```js
  assert.ok(r3.frames.some((f) => f.includes('✓ deleted — ↳ t10')));
```

(the first `d` deletes `t11` and the cursor clamps to the new last row, so the second `d` deletes `t10` — Review Focus 1).

Add a new empty-list test after the scrolling test:

```js
test('key mode: d on an empty list shows the add hint', async () => {
  const d = tmp();
  const { frames } = await drivePanel(d, ['\n', 'd'], { links: [], mode: 'open' });
  const hinted = frames.find((f) => f.includes('✗ no links yet — press a to add'));
  assert.ok(hinted, 'd with no links nudges toward add');
  assert.doesNotMatch(hinted, /deleted/);
});
```

(`\n` cancels the auto-jump add form, landing in the menu loop with zero links.)

- [ ] **Step 4: Run the suite to verify it fails**

Run: `bun test test/spacelinks.test.js`
Expected: FAIL on the Step 2/3 tests — `menuKey` returns `{ op: 'arm' }` for `d`, `keyFooter` treats `true` as a count, `panelFrame` still renders `delete which?`, integration deletes need the armed second key / wrong rows. Existing line-mode and open tests stay green.

- [ ] **Step 5: Implement the single-state machine in `spacelinks.ts`**

1. `MenuAction` (lines 47-56): drop `{ op: 'delete'; n }`, `{ op: 'arm' }`, `{ op: 'disarm' }`.
2. `menuKey` (lines 349-367): signature `menuKey(key: KeyLike | null | undefined): MenuAction`; delete the `armed`/`disarm` branches; map `d` → `{ op: 'delete-selected' }`; keep ctrl+`c`/`d` → quit, other ctrl/meta → noop, then q/escape/a/up/down/k/j/enter/digits/noop exactly as today. Update the comment above it: digits open the visible-window row; `d` deletes the cursor row.
3. `PanelFrameOptions` (lines 115-117): remove `armed?: boolean`.
4. `keyFooter` (lines 519-523): `keyFooter(visibleCount: number): string`; delete the armed branch (keep `digitsHint` for the open hint).
5. `panelFrame` (lines 530-566): drop `armed` from the destructure and the `shown` inverse-digit logic (render `digit` plainly); footer call becomes `keyFooter(visibleCount)`.
6. `PanelCtx` (line 131): remove `armed: boolean`; `createPanelCtx` (line 620) and `render` (line 625) drop the field.
7. `keyDriver` (lines 898-905): `const act = menuKey(key);` and delete the two `ctx.armed` mutation lines; delete the `{ op: 'delete' }` branch (lines 930-933). The `delete-selected` branch (lines 934-937) gets the empty-list guard mirroring `open-selected`:

```ts
if (act.op === 'delete-selected') {
  if (ctx.links().length === 0) {
    ctx.error = 'no links yet — press a to add';
    continue;
  }
  ctx.remove(ctx.cursor + 1);
  continue;
}
```

- [ ] **Step 6: Gates green**

Run: `bun run typecheck` → clean.
Run: `bun run test` → all pass (including the untouched line-mode, scrolling, add-flow, open, and refresh tests).

- [ ] **Step 7: Commit Task 1**

```bash
git add spacelinks.ts test/spacelinks.test.js
git commit -m "feat: d deletes the selected row in one keypress"
```

---

### Task 2: README sync

**Files:**
- Modify: `README.md` (key table row ~line 156, armed-digit sentence ~line 159)

**Interfaces:**
- Consumes: Task 1 final behavior.
- Produces: documentation only, no code interfaces.

- [ ] **Step 1: Update the key table**

Change the `d` row from `d` then a digit or `Enter` → delete that row / the selected row; any other key cancels to:

```markdown
   | `d` | delete the row the `›` cursor is on (move with `↑`/`↓` first) |
```

- [ ] **Step 2: Update the armed-state paragraph (~line 159)**

Replace `While delete is armed, the row digits are highlighted.` with a sentence matching the new semantics and the accepted no-confirmation tradeoff:

```markdown
   Deleting needs no confirmation: the `✓ deleted — ↳ …` status line names the
   row removed until your next keypress.
```

(Keep the rest of that paragraph about the honest footer / silent stray keys.)

- [ ] **Step 3: Verify no stale copy remains and gates still pass**

Run: `grep -n 'armed\|delete which' README.md` → no matches in key-mode context (the line-mode `d <n>` mentions stay).
Run: `bun run typecheck` and `bun run test` → green (docs-only change, but the gates must be green at the tip).

- [ ] **Step 4: Commit Task 2**

```bash
git add README.md
git commit -m "docs: single-key delete semantics in README"
```
