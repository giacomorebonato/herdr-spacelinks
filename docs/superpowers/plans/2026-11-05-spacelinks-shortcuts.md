# Spacelinks Intuitive Shortcuts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Single-key modal commands, a direct `spacelinks.add` action, and a `workspace.focused` republish hook — the herdr-bookmark shortcut feel for spacelinks.

**Architecture:** Same single-file plugin. Pure logic (menu state machine, caps, report plan) stays testable; `panelMain` splits into a shared panel context plus two input drivers — single-key on TTY stdin (`readline.emitKeypressEvents` + raw mode, temp readline for prompt lines) and the existing line-based REPL as non-TTY fallback. A `refresh` subcommand answers the focus event; `open` action gains a `mode` handoff so the popup can start pre-armed in the add form.

**Tech Stack:** Node.js ≥18 (CJS, zero deps), `node --test`, herdr 0.9.3+ CLI via `HERDR_BIN_PATH`.

**Spec:** `docs/superpowers/specs/2026-11-05-spacelinks-shortcuts-design.md` (amends `2026-11-05-spacelinks-design.md`)

## Global Constraints

- Single file `spacelinks.js` at repo root; CJS (`module.exports`); dispatch only under `require.main === module`. No `package.json`, no deps, no build.
- All herdr calls through `herdrRun` (`HERDR_BIN_PATH || "herdr"`), `spawnSync`.
- Metadata source `plugin:spacelinks`. Sets: `spacelink_1..N` for `N = min(len, 9)`. Clears: `spacelink_{N+1..14}` — always 14 keys per report call.
- Token value `"↳ " + title`, capped 80 code points. `MAX_LINKS = 9`: `addLink` refuses at full-list length ≥ 9, message `space link limit reached (9)`.
- `pending.json` = `{ workspaceId, label, mode }`, mode `'open' | 'add'` (missing mode reads as `'open'`).
- Pinned copy — key-mode footer: `1..9 open · a add · d delete · q/esc close`; armed footer: `delete which? 1..9 · esc cancels`; key-mode unknown-key error: `unknown key — 1..9 open · a add · d delete · q/esc close`; >9 warning line: `(N links stored — showing first 9)`. Line-mode footer stays `a — add · <n> — open · d <n> — delete · q — close`.
- Manifest: `id = "spacelinks"`, `min_herdr_version = "0.9.3"` unchanged.
- Tests: `node --test test/spacelinks.test.js` green before each commit.

## Review Focus

1. **Legacy >9 links** (stored before the cap): visible list capped at 9, warning line shown, nothing deleted from `links.json`, report clears `spacelink_10..14`. → Task 1 `planReport` 12-links test; Task 2 pipe test asserting `showing first 9`.
2. **Keys typed during a prompt** (e.g. `d` inside the URL field) must not arm/delete in the menu afterwards. → menu purity is unit-tested (Task 1); the no-leak guarantee is the manual pty smoke in Task 2 (single waiter, readline owns input during prompts).
3. **Esc / q while armed** must disarm, never delete or quit on the same press. → Task 1 `menuKey` armed tests.
4. **Non-TTY stdin** (pipes, tests): line mode behaves exactly as today — every existing test and smoke keeps passing unmodified in behavior. → Task 2 runs the full suite + both original pipe smokes.
5. **Cancel from auto-jump** (empty URL on the pre-armed add form) lands on the menu, never re-prompts in a loop, writes nothing. → Task 2 line-mode pipe test with `pending.json` `mode:'add'`.

---

### Task 1: Menu state machine, 9-link cap, legacy-safe report plan

**Files:**
- Modify: `spacelinks.js`
- Modify: `test/spacelinks.test.js`

**Interfaces:**
- Produces: `menuKey(armed, key) -> { op: 'open'|'add'|'delete'|'quit'|'arm'|'disarm'|'error', n?: number, message?: string }` — `key` is a keypress `key` object (`{ name, ctrl, ... }`). Not armed: `q`/`escape`/`ctrl+c` → quit; `a` → add; `d` → arm; `1..9` → open n; anything else → `{ op: 'error', message: 'unknown key — 1..9 open · a add · d delete · q/esc close' }`. Armed: `1..9` → delete n; any other key → disarm.
- Produces: `visibleLinks(links) -> links.slice(0, 9)`.
- Changes: `addLink` cap message `space link limit reached (9)`; `planReport` — sets `spacelink_1..min(len,9)`, clears `spacelink_{N+1..14}`.

- [ ] **Step 1: Write failing tests** — update the `addLink` and `planReport` tests to the 9-cap semantics (full 9 → refuse with `/limit reached \(9\)/`); add: `planReport` with 12 stored links → 9 sets + 5 clears and clears include `spacelink_10`; `visibleLinks` slices to 9; `menuKey` cases: not-armed `a`/`d`/`3`/`q`/`escape`/`ctrl+c`/`x`; armed `3` → delete 3; armed `a`/`q`/`escape`/`x` → disarm.

```js
test('menuKey maps every key', () => {
  assert.deepEqual(sl.menuKey(false, { name: 'a' }), { op: 'add' });
  assert.deepEqual(sl.menuKey(false, { name: 'A', shift: true }), { op: 'add' });
  assert.deepEqual(sl.menuKey(false, { name: 'd' }), { op: 'arm' });
  assert.deepEqual(sl.menuKey(false, { name: '3' }), { op: 'open', n: 3 });
  assert.deepEqual(sl.menuKey(false, { name: 'q' }), { op: 'quit' });
  assert.deepEqual(sl.menuKey(false, { name: 'escape' }), { op: 'quit' });
  assert.deepEqual(sl.menuKey(false, { name: 'c', ctrl: true }), { op: 'quit' });
  assert.deepEqual(sl.menuKey(false, { name: 'x' }).op, 'error');
  assert.deepEqual(sl.menuKey(true, { name: '3' }), { op: 'delete', n: 3 });
  assert.deepEqual(sl.menuKey(true, { name: 'x' }), { op: 'disarm' });
  assert.deepEqual(sl.menuKey(true, { name: 'escape' }), { op: 'disarm' });
});
```

- [ ] **Step 2: Run** `node --test test/spacelinks.test.js` → FAIL on the new/updated tests
- [ ] **Step 3: Implement** `menuKey`, `visibleLinks`, retune `addLink`/`planReport` (clears to index 14 regardless of set count; both `MAX_LINKS = 9` and `CLEAR_TOKENS = 14` module constants). Export `menuKey`, `visibleLinks`.
- [ ] **Step 4: Run** `node --test test/spacelinks.test.js` → PASS
- [ ] **Step 5: Commit** `git commit -am "feat: single-key menu state machine and 9-link cap"`

### Task 2: Panel split — shared context, key driver, line fallback

**Files:**
- Modify: `spacelinks.js`
- Modify: `test/spacelinks.test.js`

**Interfaces:**
- Consumes: Task 1 (`menuKey`, `visibleLinks`, `planReport`, `addLink`).
- Produces: `isTTY(stdin) -> boolean` (`stdin.isTTY && typeof stdin.setRawMode === 'function'`). `resolveTarget` now returns `{ workspaceId, label, mode }` (mode from `pending.json`, default `'open'`). `panelMain({ env, stdin, stdout })` behavior: TTY → key driver (single keypresses via `emitKeypressEvents` + raw mode; prompts via a temporary `readline` interface; auto-jump into the add form once when `mode === 'add'` or no links; after open/delete/add/errors redraw; restore cooked mode before exit); non-TTY → today's line loop via `parseCommand` (auto-jump into the add form only when `mode === 'add'`).

**Implementation notes:** one persistent `keypress` listener with a single waiter slot (drops keys while no waiter — prompts own the stream); `readline` interface created per prompt line and closed after; `rl.on('close')` resolves the prompt with `null` (Ctrl+C/EOF → cancel add, back to menu); input `close` in key mode → quit. Frame: same header/list/error shape as today plus, when stored > visible, the pinned warning line; footer per active mode (pinned copy above); armed flag swaps the key-mode footer.

- [ ] **Step 1: Write failing tests** (pipe-driven, line mode):
  - `pending.json` `{workspaceId:'w1', label:'web', mode:'add'}` + empty state, stdin `'My title\nhttps://x.dev\n'` (EOF) → exits 0, `links.json` has the link, stub log shows one `report-metadata`.
  - Same setup, stdin `'\n\nq\n'` (empty title, empty URL, then quit) → exits 0, `links.json` has no `w1` entry (cancel writes nothing, no re-prompt loop), stdout shows the line-mode footer.
  - State with 12 links, stdin `'q\n'` → stdout contains `showing first 9` and `12 links stored`.
  - `isTTY` returns false for a `PassThrough` and true for a fake `{ isTTY: true, setRawMode() {} }`.
  - `menuKey`-driven bounds already covered; keep existing `parseCommand` tests untouched.
- [ ] **Step 2: Run** `node --test test/spacelinks.test.js` → FAIL on new tests
- [ ] **Step 3: Implement** the split (`isTTY`, shared panel context: render/persistAndReport/addFlow/open/remove with bounds vs the full stored list; two drivers; `resolveTarget` mode).
- [ ] **Step 4: Run** `node --test test/spacelinks.test.js` → PASS (all, including the pre-existing panel tests)
- [ ] **Step 5: Pipe smokes** — `printf 'q\n' | node spacelinks.js panel` (state has links) → exit 0, header + title on stdout; `printf 'a\nMy title\nexample.com/x\nq\n' | node spacelinks.js panel` → link stored, one report call. Both exit 0.
- [ ] **Step 6: Manual pty smoke (TTY path)** — `printf 'q' | script -q /dev/null node spacelinks.js panel` with env set: modal renders, `q` exits. Then interactively: no-links auto-jump (empty title + empty URL lands on menu), `a`-add, digit-open (opens browser), `d`+digit deletes, `d`+`esc` disarms, typing `d` inside the URL prompt does not arm. Fix and re-verify anything broken.
- [ ] **Step 7: Commit** `git commit -am "feat: single-key modal with line-mode fallback"`

### Task 3: `spacelinks.add` action

**Files:**
- Modify: `spacelinks.js`
- Modify: `herdr-plugin.toml`
- Modify: `test/spacelinks.test.js`

**Interfaces:**
- Changes: `openAction(stateDir, workspaceId, label, run, mode = 'open')` — writes `pending.json` `{workspaceId, label, mode}`; dispatch gains `add` (resolves context from `HERDR_PLUGIN_CONTEXT_JSON`, calls `openAction(..., 'add')`).
- Manifest: `[[actions]] id = "add"`, `title = "Add space link"`, `contexts = ["workspace"]`, `command = ["node", "spacelinks.js", "add"]`.

- [ ] **Step 1: Write failing tests** — update the existing `openAction` pending-shape assertion to `{ workspaceId: 'w2', label: 'web-dashboard', mode: 'open' }`; add: `openAction(d, 'w2', 'web', run, 'add')` → pending `{..., mode: 'add'}` and one `plugin pane open` call; failure stub still throws `/boom|popup/`.
- [ ] **Step 2: Run** `node --test test/spacelinks.test.js` → FAIL
- [ ] **Step 3: Implement** the mode param, `add` dispatch, manifest action block.
- [ ] **Step 4: Run** `node --test test/spacelinks.test.js` → PASS
- [ ] **Step 5: Commit** `git commit -am "feat: add action opens the popup pre-armed in the add form"`

### Task 4: `workspace.focused` republish hook

**Files:**
- Modify: `spacelinks.js`
- Modify: `herdr-plugin.toml`
- Modify: `test/spacelinks.test.js`

**Interfaces:**
- Produces: `refreshFocused(env, dir, run) -> { ok: true, skipped?: 'no workspace id' | 'no links stored' } | throws` — parses `env.HERDR_PLUGIN_EVENT_JSON` (missing/corrupt → treated as absent), workspace id from `ev.workspace_id ?? ev.workspace?.workspace_id ?? env.HERDR_WORKSPACE_ID`; no id or no stored entry → skipped (no herdr call); stored entry → `reportTokens(id, linksFor(state, id), run)` (empty entry → all-clears report).
- Dispatch: `refresh` → `refreshFocused(process.env, stateDir(), herdrRun)`; exit 0; throw → stderr + exit 1.
- Manifest: `[[events]] on = "workspace.focused"`, `command = ["node", "spacelinks.js", "refresh"]`.

- [ ] **Step 1: Write failing tests** — stored entry + event JSON `{workspace_id:'w1'}` → one `report-metadata` call for `w1`; nested `{workspace:{workspace_id:'w1'}}` → same via fallback path; `HERDR_WORKSPACE_ID` fallback; un-stored workspace → no call, `{ok:true, skipped:'no links stored'}`; no ids at all → `{ok:true, skipped:'no workspace id'}`, no call; corrupt JSON → fallback path; failing report stub → throws.
- [ ] **Step 2: Run** `node --test test/spacelinks.test.js` → FAIL
- [ ] **Step 3: Implement** `refreshFocused`, dispatch, manifest event block.
- [ ] **Step 4: Run** `node --test test/spacelinks.test.js` → PASS
- [ ] **Step 5: Commit** `git commit -am "feat: focus event republishes stored sidebar tokens"`

### Task 5: README, manifest validation, live verification

**Files:**
- Modify: `README.md`
- Modify (user-owned, existing spacelinks block only): `~/.config/herdr/config.toml`

**Interfaces:**
- Consumes: Tasks 1–4 behaviors.
- Produces: README documenting both bindings, single-key commands, 9-link cap, 9-row sidebar block, honest key-clash note (`prefix+1..9` is `switch_tab`; `prefix+alt+…` free; how to rebind), reload-config/focus-republish behavior; the user's config gains the `prefix+alt+a` → `spacelinks.add` binding.

- [ ] **Step 1: Rewrite README sections** — Use (single-key table + auto-jump + Ctrl-click + line-mode fallback note), Install keys (two `[[keys.command]]` blocks), sidebar rows block (2 default + 9 token rows), behavior notes (focus hook restores rows after `reload-config`; restarts covered by startup hook), keep uninstall.
- [ ] **Step 2: Validate manifest + link** — `herdr plugin link "$PWD"` (relinks to this worktree), `herdr plugin list` → `spacelinks` present, no warnings.
- [ ] **Step 3: Live walkthrough** — backup then edit the user's `config.toml` spacelinks block (add the `prefix+alt+a` binding), `herdr server reload-config`, then with the user or on a test Space: `prefix+m` → modal renders; digit opens link; `a` adds (row appears in sidebar); `d`+digit deletes; `prefix+alt+a` → add form directly; `herdr server reload-config` → rows drop → focus another Space and back → rows restored (hook proof); `herdr plugin log list --plugin spacelinks` clean. If the hook doesn't republish: dump `HERDR_PLUGIN_EVENT_JSON` via a temporary `env >` hook, adjust `refreshFocused` field paths, re-test.
- [ ] **Step 4: Commit** `git commit -am "docs: single-key usage, add binding, focus republish notes"`
