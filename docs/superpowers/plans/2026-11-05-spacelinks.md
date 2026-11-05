# Space Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A herdr plugin (`spacelinks`) that shows per-Space web links indented under each Space in the sidebar, managed from a single `prefix+m` popup modal.

**Architecture:** One CJS Node script (`spacelinks.js`) with three subcommands: `open` (keybinding action: writes the invoking space to `pending.json`, opens the popup pane), `panel` (popup: list + add/delete/open links; persists to `links.json` and reports `workspace report-metadata` tokens), `apply` (startup hook: re-reports tokens for every live workspace, since token metadata does not survive restarts). A `[[keys.command]]` binding and `ui.sidebar.spaces.rows` `$spacelink_N` rows in the user's `config.toml` complete the surface.

**Tech Stack:** Node.js ≥18 (CJS, zero npm deps, no build), `node --test`, herdr 0.9.5 CLI via `HERDR_BIN_PATH`.

**Spec:** `docs/superpowers/specs/2026-11-05-spacelinks-design.md`

## Global Constraints

- Single file `spacelinks.js` at repo root; CJS (`module.exports`); subcommand dispatch only under `require.main === module`. No `package.json`, no npm deps, no build step.
- All herdr calls go through `process.env.HERDR_BIN_PATH || "herdr"`.
- State: `HERDR_PLUGIN_STATE_DIR/links.json` — `{ "<workspaceId>": { "label": string, "links": [{ "title": string, "url": string }] } }`. Handoff: `HERDR_PLUGIN_STATE_DIR/pending.json` — `{ "workspaceId": string, "label": string }`.
- Metadata source id: `plugin:spacelinks`. Token names: `spacelink_1` … `spacelink_14`. Token values: `"↳ " + title`, capped at 80 characters (count by Unicode code points). Max 14 links per Space.
- Report call: `workspace report-metadata <workspaceId> --source plugin:spacelinks` with `--token name=value` (sets) and `--clear-token name` (clears); total keys per call ≤ 16 (14 in practice).
- Workspace list parse: stdout JSON → `.result.workspaces[]` with `.workspace_id`, `.label`; throw `unexpected workspace list output` when the path is missing.
- Pinned copy: modal header `Space links — <label> (<workspaceId>)`; prompts `Title (Enter = derive from URL):` and `URL:`; footer `a — add · <n> — open · d <n> — delete · q — close`.
- Tests: `node --test test/` (repo root), all green before each commit.
- Manifest: id `spacelinks`, `min_herdr_version = "0.9.5"`, platforms `["macos", "linux", "windows"]`.

## Review Focus

1. **Corrupt `links.json`** — a reasonable person expects a clear error, not silent data loss: `readState` throws on invalid JSON (never overwrites); panel catches and shows the error line instead of wiping. → Task 1 test `readState throws on corrupt JSON`; Task 5 smoke step.
2. **Hostile/odd URLs** — `ftp://x`, `javascript:alert(1)`, schemeless `myhost/path`, trailing spaces: must never reach state; schemeless input gets `https://` prepended, non-http(s) rejected. → Task 1 `normalizeUrl` tests.
3. **Long titles** — an 100-char title must not make `report-metadata` reject the whole call: token value truncated to 80 code points. → Task 1 `tokenValue` test; Task 2 `planReport` asserts every set value length ≤ 80.
4. **Deleting the last link** — sidebar row must disappear, not ghost: `planReport([])` clears all 14 tokens. → Task 2 test.
5. **herdr CLI failure** (popup busy `ui_busy`, server gone): the action/apply exits non-zero with the CLI's stderr surfaced (lands in `herdr plugin log`); apply continues per-workspace but exits 1 if any failed. → Tasks 3–4 stub-failure tests.

---

### Task 1: Pure core — state, URL, title, token logic

**Files:**
- Create: `spacelinks.js`
- Create: `test/spacelinks.test.js`

**Interfaces (produces, used by all later tasks):**
- `readState(stateDir) -> Object` — `{}` when file missing; **throws** `Error("links.json is corrupt: ...")` on unparseable JSON; never writes.
- `writeState(stateDir, state) -> void` — mkdir -p, write to `links.json.tmp`, `renameSync` over `links.json`.
- `linksFor(state, workspaceId) -> Array<{title, url}>` — `[]` for unknown ids.
- `normalizeUrl(raw) -> string | null` — trim; if no `scheme://` prefix, prepend `https://`; accept only final `http:`/`https:` URLs (validate with `new URL`); else `null`.
- `deriveTitle(url) -> string` — strip leading `http(s)://`, strip one trailing `/`, cap 78 code points.
- `tokenValue(title) -> string` — `"↳ " + title`, capped 80 code points.
- `stateDir() -> string` — `process.env.HERDR_PLUGIN_STATE_DIR`, throws if unset (runtime only).

- [ ] **Step 1: Write failing tests** in `test/spacelinks.test.js`

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sl = require('../spacelinks.js');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'sl-'));

test('readState returns {} when file missing', () => {
  assert.deepEqual(sl.readState(tmp()), {});
});
test('readState throws on corrupt JSON', () => {
  const d = tmp(); fs.writeFileSync(path.join(d, 'links.json'), '{oops');
  assert.throws(() => sl.readState(d), /corrupt/);
});
test('writeState round-trips', () => {
  const d = tmp(); const s = { w1: { label: 'web', links: [{ title: 'A', url: 'https://a.dev' }] } };
  sl.writeState(d, s);
  assert.deepEqual(sl.readState(d), s);
});
test('linksFor defaults to []', () => {
  assert.deepEqual(sl.linksFor({ w1: { label: '', links: [] } }, 'w2'), []);
});
test('normalizeUrl', () => {
  assert.equal(sl.normalizeUrl('myhost/path'), 'https://myhost/path');
  assert.equal(sl.normalizeUrl('  https://x.dev  '), 'https://x.dev');
  assert.equal(sl.normalizeUrl('ftp://x.dev'), null);
  assert.equal(sl.normalizeUrl('javascript:alert(1)'), null);
  assert.equal(sl.normalizeUrl('   '), null);
});
test('deriveTitle', () => {
  assert.equal(sl.deriveTitle('https://github.com/org/repo/'), 'github.com/org/repo');
  assert.equal(sl.deriveTitle('http://x.dev'), 'x.dev');
  assert.equal(sl.deriveTitle('https://' + 'a'.repeat(100) + '.dev').length, 78);
});
test('tokenValue caps at 80 code points and prefixes glyph', () => {
  assert.equal(sl.tokenValue('GitHub repo'), '↳ GitHub repo');
  assert.equal(Array.from(sl.tokenValue('x'.repeat(100))).length, 80);
});
```

- [ ] **Step 2: Run to verify failure** — `node --test test/` → FAIL (`Cannot find module '../spacelinks.js'`)
- [ ] **Step 3: Implement** `spacelinks.js` with the six functions above. Notes: `require.main === module` dispatch comes in Task 4 — for now export only; code-point caps via `Array.from(s).slice(0, n).join('')`.
- [ ] **Step 4: Run tests** — `node --test test/` → PASS (all green)
- [ ] **Step 5: Commit** — `git add spacelinks.js test/spacelinks.test.js && git commit -m "feat: state, URL, and token logic for spacelinks"`

### Task 2: Link mutations + metadata report planning

**Files:**
- Modify: `spacelinks.js`
- Modify: `test/spacelinks.test.js`

**Interfaces:**
- Consumes: Task 1 functions.
- Produces (used by Tasks 3, 5): `addLink(links, title, url) -> { ok: boolean, message: string, links }` — normalizes URL first (reject → `{ok:false, message:'not a valid http(s) URL'}`); empty title → `deriveTitle`; refuses when `links.length >= 14` with message `space link limit reached (14)`.
- `removeLink(links, n) -> { ok, message, links }` — 1-based, bounds-checked (`no link 5` when out of range).
- `planReport(links) -> { sets: Array<{name, value}>, clears: Array<string> }` — sets = `spacelink_1..N` for `N = min(links.length, 14)`; clears = remaining names up to `spacelink_14`; total keys always ≤ 14; every value length ≤ 80.

- [ ] **Step 1: Write failing tests** (append)

```js
test('addLink normalizes, derives title, caps at 14', () => {
  const r = sl.addLink([], '', 'github.com/org/repo');
  assert.deepEqual(r.links, [{ title: 'github.com/org/repo', url: 'https://github.com/org/repo' }]);
  assert.equal(sl.addLink([], 'T', 'ftp://x').ok, false);
  const full = Array.from({ length: 14 }, (_, i) => ({ title: 't' + i, url: 'https://x.dev/' + i }));
  const r14 = sl.addLink(full, 'T', 'https://y.dev');
  assert.equal(r14.ok, false); assert.match(r14.message, /limit/);
});
test('removeLink bounds-checks', () => {
  const r = sl.removeLink([{ title: 'A', url: 'https://a.dev' }], 2);
  assert.equal(r.ok, false); assert.match(r.message, /no link 2/);
});
test('planReport: 3 links → 3 sets, 11 clears; [] → 14 clears; values ≤80', () => {
  const three = sl.planReport([{ title: 'a', url: 'https://a' }, { title: 'b', url: 'https://b' }, { title: 'c', url: 'https://c' }]);
  assert.equal(three.sets.length, 3); assert.equal(three.clears.length, 11);
  assert.deepEqual(three.sets[0], { name: 'spacelink_1', value: '↳ a' });
  const none = sl.planReport([]);
  assert.equal(none.sets.length, 0); assert.equal(none.clears.length, 14);
  for (const s of three.sets) assert.ok(Array.from(s.value).length <= 80);
});
```

- [ ] **Step 2: Run** — `node --test test/` → FAIL on the new tests
- [ ] **Step 3: Implement** the three functions in `spacelinks.js` (pure; no IO).
- [ ] **Step 4: Run** — `node --test test/` → PASS
- [ ] **Step 5: Commit** — `git commit -am "feat: link mutations and metadata report planning"`

### Task 3: herdr runner + `apply` subcommand

**Files:**
- Modify: `spacelinks.js`
- Modify: `test/spacelinks.test.js`

**Interfaces:**
- Consumes: `readState`, `writeState`, `planReport` (Tasks 1–2).
- Produces (used by Tasks 4–5): `herdrRun(args, opts) -> { status, stdout, stderr }` — `spawnSync(HERDR_BIN_PATH || 'herdr', args, {encoding:'utf8'})`; returns the spawn result as-is (status may be non-zero; callers decide).
- `reportTokens(workspaceId, links, herdrRun) -> void` — builds argv `['workspace','report-metadata',workspaceId,'--source','plugin:spacelinks', ...sets.map(--token name=value), ...clears.map(--clear-token name)]`; throws `Error(stderr || 'workspace report-metadata failed')` on non-zero status.
- `applyAll(stateDir, herdrRun) -> { reported: number, failed: number }` — `readState`; if no workspaces stored → `{0,0}` without calling herdr; else `herdrRun(['workspace','list'])`, parse `.result.workspaces`, for each live workspace with stored links call `reportTokens` (catch per workspace, count failed), update stored `label` from the list; `writeState` at the end.

- [ ] **Step 1: Write failing tests** (append). Stub pattern: write a shell script to tmp that prints a fixture `{"result":{"type":"workspace_list","workspaces":[...]}}` and appends its args to a log file; pass it via a `herdrRun` bound to `env.HERDR_BIN_PATH`.

```js
const makeStub = (dir, out, fail) => {
  const p = path.join(dir, 'herdr-stub.sh');
  fs.writeFileSync(p, `#!/bin/sh\necho "$@" >> "${dir}/calls.log"\n${fail ? 'echo "boom" >&2; exit 1' : `cat <<'EOF'\n${out}\nEOF`}\n`);
  fs.chmodSync(p, 0o755);
  return p;
};
```

Tests: (a) `applyAll` with two stored workspaces, one of which is live in the stub list → exactly one `report-metadata` call logged with `--source plugin:spacelinks` and a `--clear-token spacelink_14`; stored label updated to the live label. (b) failing stub → `failed: 1`, function did not throw. (c) empty state → stub never invoked (`calls.log` absent).

- [ ] **Step 2: Run** — FAIL (functions undefined)
- [ ] **Step 3: Implement** `herdrRun`, `reportTokens`, `applyAll`. Note: parse list defensively — `JSON.parse(stdout)?.result?.workspaces` or throw `unexpected workspace list output`.
- [ ] **Step 4: Run** — PASS
- [ ] **Step 5: Commit** — `git commit -am "feat: apply subcommand re-reports sidebar tokens on startup"`

### Task 4: `open` action subcommand + dispatch

**Files:**
- Modify: `spacelinks.js`
- Modify: `test/spacelinks.test.js`

**Interfaces:**
- Consumes: Task 3 `herdrRun` shape.
- Produces (used by Task 5): `openAction(stateDir, workspaceId, label, herdrRun) -> void` — writes `pending.json` `{workspaceId, label}`; then `herdrRun(['plugin','pane','open','--plugin','spacelinks','--entrypoint','panel'])`; throws on non-zero status (`popup already open, or server busy` prefix + stderr). Dispatch: `require.main === module` → argv[2] `open` → resolve `workspaceId`/`label` from `HERDR_PLUGIN_CONTEXT_JSON` (fields `workspace_id`, `workspace_label`) → `openAction(process.env.HERDR_PLUGIN_STATE_DIR, …)`; any throw → `console.error` + `process.exit(1)`.

- [ ] **Step 1: Write failing tests** (append): with stub — `openAction` writes `pending.json` with the exact shape and logs a `plugin pane open --plugin spacelinks --entrypoint panel` call; failing stub → throws with `/boom|popup/`. Dispatch is runtime glue: no test.
- [ ] **Step 2: Run** — FAIL
- [ ] **Step 3: Implement** `openAction` + dispatch guard for `open`.
- [ ] **Step 4: Run** — PASS. Also `node spacelinks.js open` without `HERDR_PLUGIN_STATE_DIR` → exits 1 with a clear error on stderr (manual check).
- [ ] **Step 5: Commit** — `git commit -am "feat: open action launches the links popup for the focused space"`

### Task 5: `panel` TUI subcommand

**Files:**
- Modify: `spacelinks.js`
- Modify: `test/spacelinks.test.js`

**Interfaces:**
- Consumes: Tasks 1–3 (`readState`, `writeState`, `linksFor`, `normalizeUrl`, `addLink`, `removeLink`, `planReport`, `reportTokens`), Task 4 `pending.json`.
- Produces: `parseCommand(line) -> { op: 'add'|'open'|'delete'|'quit'|'redraw'|'error', n?: number, message?: string }` — trim; `''`→redraw; `a`→add; `q`/`quit`→quit; `/^\d+$/`→open n; `/^d\s+(\d+)$/i`→delete n; else error with message `unknown command — a=add, <n>=open, d <n>=delete, q=close`. `openExternal(url) -> void` — spawn detached+unref: darwin `open [url]`, win32 `cmd /c start "" url`, else `xdg-open [url]`. `panelMain({ env, stdin, stdout }) -> Promise<void>` — the loop (below).

Panel behavior (implementation notes, not transcript): resolve space via `pending.json` → else `HERDR_PLUGIN_CONTEXT_JSON.workspace_id/label` → else throw `cannot resolve current space`. Loop: clear + render frame (header per pinned copy; numbered links as OSC 8 `\x1b]8;;URL\x1b\\text\x1b]8;;\x1b\\` on the title; `(none yet)` when empty; footer per pinned copy; `✗ <message>` line for last error); prompt `> ` via readline; dispatch `parseCommand`: add → prompt `Title (Enter = derive from URL):` then `URL:` (empty URL cancels; invalid → `✗ not a valid http(s) URL` and re-prompt `URL:`); on save → persist, `reportTokens`, redraw. open → `openExternal`, exit. delete → `removeLink`, persist, `reportTokens`, redraw. quit → exit 0. `readState` corruption → print `links.json is corrupt — fix or remove it` and exit 1 (never write).

- [ ] **Step 1: Write failing tests** (append) for `parseCommand` (each op + unknown + `d 12` case) — no TUI tests.
- [ ] **Step 2: Run** — FAIL
- [ ] **Step 3: Implement** `parseCommand`, `openExternal`, `panelMain`, dispatch for `panel`.
- [ ] **Step 4: Run** — `node --test test/` → PASS
- [ ] **Step 5: Smoke test the TUI** (stdin-driven; no live herdr needed): tmp state dir with `links.json` for `w1`, `pending.json` `{workspaceId:'w1', label:'web'}`, `HERDR_BIN_PATH` set to a passing stub. `printf 'q\n' | node spacelinks.js panel` → exit 0, stdout contains `Space links — web (w1)` and the link title. Then `printf 'a\nMy title\nexample.com/x\nq\n' | node spacelinks.js panel` → `pending.json`'s workspace now has the link in `links.json` and the stub log shows one `report-metadata` call.
- [ ] **Step 6: Commit** — `git commit -am "feat: panel popup UI for listing, adding, opening links"`

### Task 6: Manifest, README, plugin link validation

**Files:**
- Create: `herdr-plugin.toml`
- Modify: `README.md`

**Interfaces:**
- Consumes: subcommands `open` (action), `panel` (pane, popup `width = "70%"`, `height = 20`), `apply` (startup) — exact manifest per spec sketch with `min_herdr_version = "0.9.5"`, platforms `["macos", "linux", "windows"]`, action `contexts = ["workspace"]`, plugin id `spacelinks`.
- Produces: an installable plugin + user instructions.

- [ ] **Step 1: Write `herdr-plugin.toml`** exactly per the spec's manifest sketch (corrected min version).
- [ ] **Step 2: Write `README.md`**: what it does, requirements (herdr ≥ 0.9.5, Node ≥ 18), install (`herdr plugin link <repo>`), the two `config.toml` blocks verbatim (keybinding `prefix+m` → `spacelinks.open` with description `space links`; `[ui.sidebar.spaces]` rows = 2 default rows + 14 `{ token = "$spacelink_N", dim = true }` rows), `herdr server reload-config`, usage walkthrough, uninstall. Note links show only in the expanded sidebar and Ctrl-click requires `ui.mouse_capture` (default on).
- [ ] **Step 3: Validate** — `herdr plugin link "$PWD"` then `herdr plugin list` → plugin `spacelinks` present, no `warnings`. If warnings: fix manifest, re-link. (`herdr plugin unlink spacelinks` only if validation must be repeated.)
- [ ] **Step 4: Commit** — `git commit -am "feat: manifest, README, and local plugin link validation"`

### Task 7: Install on the user's machine + live verification (user-in-loop)

**Files:**
- Modify (user-owned, **with explicit permission first**): `~/.config/herdr/config.toml`

- [ ] **Step 1: Ask the user** for permission to append the two config blocks from the README to their `config.toml` (or have them paste it themselves). Back up the file first (`cp config.toml config.toml.bak-spacelinks`).
- [ ] **Step 2: Reload** — `herdr server reload-config` (or restart herdr).
- [ ] **Step 3: User walkthrough checklist** — in the user's herdr, with a space focused: press `prefix+m` → modal appears with the space label; add `example.com` with empty title → sidebar shows `↳ example.com`; type `1` → browser opens the URL; `d 1` → row disappears; restart herdr → link still in sidebar (startup hook). Fix any breakage, re-verify, commit fixes.
- [ ] **Step 4: Commit** any fixes; leave the plugin linked and enabled.
