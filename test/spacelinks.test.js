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
test('readState validates the JSON shape (hand-edited state files)', () => {
  const d = tmp();
  fs.writeFileSync(path.join(d, 'links.json'), '{"w1":{"links":"nope"}}');
  assert.throws(() => sl.readState(d), /corrupt: unexpected shape/);
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

test('addLink normalizes, derives title, caps at 9', () => {
  const r = sl.addLink([], '', 'github.com/org/repo');
  assert.deepEqual(r.links, [{ title: 'github.com/org/repo', url: 'https://github.com/org/repo' }]);
  assert.equal(sl.addLink([], 'T', 'ftp://x').ok, false);
  const full = Array.from({ length: 9 }, (_, i) => ({ title: 't' + i, url: 'https://x.dev/' + i }));
  const r9 = sl.addLink(full, 'T', 'https://y.dev');
  assert.equal(r9.ok, false); assert.match(r9.message, /limit reached \(9\)/);
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
test('planReport caps sets at 9 and clears to spacelink_14', () => {
  const twelve = Array.from({ length: 12 }, (_, i) => ({ title: 't' + i, url: 'https://x.dev/' + i }));
  const r = sl.planReport(twelve);
  assert.equal(r.sets.length, 9);
  assert.equal(r.clears.length, 5);
  assert.ok(r.clears.includes('spacelink_10'));
  assert.equal(r.clears[r.clears.length - 1], 'spacelink_14');
});
test('visibleLinks slices to 9', () => {
  const twelve = Array.from({ length: 12 }, (_, i) => ({ title: 't' + i, url: 'https://x.dev/' + i }));
  assert.equal(sl.visibleLinks(twelve).length, 9);
  assert.deepEqual(sl.visibleLinks(twelve.slice(0, 3)), twelve.slice(0, 3));
});
test('menuKey maps the cursor-model keymap', () => {
  assert.deepEqual(sl.menuKey(false, { name: 'a' }), { op: 'add' });
  assert.deepEqual(sl.menuKey(false, { name: 'A', shift: true }), { op: 'add' });
  assert.deepEqual(sl.menuKey(false, { name: 'd' }), { op: 'arm' });
  assert.deepEqual(sl.menuKey(false, { name: '3' }), { op: 'open', n: 3 });
  assert.deepEqual(sl.menuKey(false, { name: 'q' }), { op: 'quit' });
  assert.deepEqual(sl.menuKey(false, { name: 'escape' }), { op: 'quit' });
  assert.deepEqual(sl.menuKey(false, { name: 'c', ctrl: true }), { op: 'quit' });
  assert.deepEqual(sl.menuKey(false, { name: 'up' }), { op: 'move', delta: -1 });
  assert.deepEqual(sl.menuKey(false, { name: 'k' }), { op: 'move', delta: -1 });
  assert.deepEqual(sl.menuKey(false, { name: 'down' }), { op: 'move', delta: 1 });
  assert.deepEqual(sl.menuKey(false, { name: 'j' }), { op: 'move', delta: 1 });
  assert.deepEqual(sl.menuKey(false, { name: 'return' }), { op: 'open-selected' });
  assert.deepEqual(sl.menuKey(false, { name: 'enter' }), { op: 'open-selected' });
  assert.deepEqual(sl.menuKey(false, { name: 'x' }), { op: 'noop' });
  assert.deepEqual(sl.menuKey(true, { name: '3' }), { op: 'delete', n: 3 });
  assert.deepEqual(sl.menuKey(true, { name: 'return' }), { op: 'delete-selected' });
  assert.deepEqual(sl.menuKey(true, { name: 'down' }), { op: 'move', delta: 1 });
  assert.deepEqual(sl.menuKey(true, { name: 'up' }), { op: 'move', delta: -1 });
  assert.deepEqual(sl.menuKey(true, { name: 'x' }), { op: 'disarm' });
  assert.deepEqual(sl.menuKey(true, { name: 'escape' }), { op: 'disarm' });
});

test('clampView keeps cursor and window coherent', () => {
  assert.deepEqual(sl.clampView(0, 0, 0), { cursor: 0, windowStart: 0 });
  assert.deepEqual(sl.clampView(5, 0, 12), { cursor: 5, windowStart: 0 });
  assert.deepEqual(sl.clampView(9, 0, 12), { cursor: 9, windowStart: 1 });
  assert.deepEqual(sl.clampView(11, 1, 12), { cursor: 11, windowStart: 3 });
  assert.deepEqual(sl.clampView(0, 3, 12), { cursor: 0, windowStart: 0 });
  assert.deepEqual(sl.clampView(99, 0, 3), { cursor: 2, windowStart: 0 });
});

test('keyFooter only advertises actionable keys', () => {
  assert.equal(sl.keyFooter(false, 0), 'a add · q close');
  assert.equal(sl.keyFooter(false, 1), 'enter open · a add · d delete · q close');
  assert.equal(sl.keyFooter(false, 3), '↑/↓ select · enter open · 1..3 open · a add · d delete · q close');
  assert.equal(sl.keyFooter(true, 3), 'delete which? 1..3 · enter = selected · esc cancels');
  assert.equal(sl.keyFooter(true, 1), 'delete which? 1 · enter = selected · esc cancels');
});

const makeStub = (dir, out, fail) => {
  const p = path.join(dir, 'herdr-stub.sh');
  const body = fail
    ? 'echo "boom" >&2; exit 1'
    : "cat <<'EOF'\n" + out + '\nEOF';
  fs.writeFileSync(p, '#!/bin/sh\necho "$@" >> "' + dir + '/calls.log"\n' + body + '\n');
  fs.chmodSync(p, 0o755);
  return p;
};
const LIST = JSON.stringify({ result: { type: 'workspace_list', workspaces: [
  { workspace_id: 'w1', label: 'web-dashboard' },
] } });

test('applyAll reports live workspaces with stored links', () => {
  const d = tmp();
  const state = {
    w1: { label: 'old', links: [{ title: 'My repo', url: 'https://github.com/org/repo' }] },
    w9: { label: 'gone', links: [{ title: 'X', url: 'https://x.dev' }] },
  };
  sl.writeState(d, state);
  const stub = makeStub(d, LIST);
  process.env.HERDR_BIN_PATH = stub;
  const run = (args) => sl.herdrRun(args);
  const result = sl.applyAll(d, run);
  delete process.env.HERDR_BIN_PATH;
  assert.deepEqual(result, { reported: 1, failed: 0 });
  const calls = fs.readFileSync(path.join(d, 'calls.log'), 'utf8').trim().split('\n');
  const reports = calls.filter((c) => c.includes('report-metadata'));
  assert.equal(reports.length, 1);
  assert.match(reports[0], /--source plugin:spacelinks/);
  assert.match(reports[0], /--clear-token spacelink_14/);
  assert.equal(sl.readState(d).w1.label, 'web-dashboard');
});
test('applyAll counts failures without throwing', () => {
  const d = tmp();
  sl.writeState(d, { w1: { label: 'web', links: [{ title: 'A', url: 'https://a.dev' }] } });
  const p = path.join(d, 'herdr-stub.sh');
  fs.writeFileSync(p, `#!/bin/sh\ncase "$*" in *report-metadata*) echo "boom" >&2; exit 1;; esac\ncat <<'EOF'\n${LIST}\nEOF\n`);
  fs.chmodSync(p, 0o755);
  process.env.HERDR_BIN_PATH = p;
  const result = sl.applyAll(d, (args) => sl.herdrRun(args));
  delete process.env.HERDR_BIN_PATH;
  assert.deepEqual(result, { reported: 0, failed: 1 });
});
test('applyAll with empty state never calls herdr', () => {
  const d = tmp();
  const stub = makeStub(d, LIST);
  process.env.HERDR_BIN_PATH = stub;
  const result = sl.applyAll(d, (args) => sl.herdrRun(args));
  delete process.env.HERDR_BIN_PATH;
  assert.deepEqual(result, { reported: 0, failed: 0 });
  assert.equal(fs.existsSync(path.join(d, 'calls.log')), false);
});

test('openAction writes pending.json and opens the panel pane', () => {
  const d = tmp();
  const stub = makeStub(d, '{}');
  process.env.HERDR_BIN_PATH = stub;
  sl.openAction(d, 'w2', 'web-dashboard', (args) => sl.herdrRun(args));
  delete process.env.HERDR_BIN_PATH;
  const pending = JSON.parse(fs.readFileSync(path.join(d, 'pending.json'), 'utf8'));
  assert.deepEqual(pending, { workspaceId: 'w2', label: 'web-dashboard', mode: 'open' });
  const calls = fs.readFileSync(path.join(d, 'calls.log'), 'utf8');
  assert.match(calls, /plugin pane open --plugin spacelinks --entrypoint panel/);
});
test('openAction mode=add pre-arms the popup', () => {
  const d = tmp();
  const stub = makeStub(d, '{}');
  process.env.HERDR_BIN_PATH = stub;
  sl.openAction(d, 'w2', 'web', (args) => sl.herdrRun(args), 'add');
  delete process.env.HERDR_BIN_PATH;
  const pending = JSON.parse(fs.readFileSync(path.join(d, 'pending.json'), 'utf8'));
  assert.deepEqual(pending, { workspaceId: 'w2', label: 'web', mode: 'add' });
  assert.match(fs.readFileSync(path.join(d, 'calls.log'), 'utf8'), /plugin pane open/);
});
test('openAction throws on herdr failure', () => {
  const d = tmp();
  const stub = makeStub(d, '', true);
  process.env.HERDR_BIN_PATH = stub;
  assert.throws(() => sl.openAction(d, 'w2', 'web', (args) => sl.herdrRun(args)), /boom|popup/);
  delete process.env.HERDR_BIN_PATH;
});

test('parseCommand dispatches every op', () => {
  assert.deepEqual(sl.parseCommand(''), { op: 'redraw' });
  assert.deepEqual(sl.parseCommand('  '), { op: 'redraw' });
  assert.deepEqual(sl.parseCommand('a'), { op: 'add' });
  assert.deepEqual(sl.parseCommand(' A '), { op: 'add' });
  assert.deepEqual(sl.parseCommand('q'), { op: 'quit' });
  assert.deepEqual(sl.parseCommand('quit'), { op: 'quit' });
  assert.deepEqual(sl.parseCommand('3'), { op: 'open', n: 3 });
  assert.deepEqual(sl.parseCommand(' d 12 '), { op: 'delete', n: 12 });
  assert.deepEqual(sl.parseCommand('D 12'), { op: 'delete', n: 12 });
  const bad = sl.parseCommand('xyz');
  assert.equal(bad.op, 'error');
  assert.match(bad.message, /unknown command/);
});

// --- Task 2: panel split, line-mode fallback behaviors ---
const { spawnSync: cpSpawnSync } = require('node:child_process');
const ROOT = path.join(__dirname, '..');

function runPanel(d, input, extraEnv = {}) {
  return cpSpawnSync(process.execPath, [path.join(ROOT, 'spacelinks.js'), 'panel'], {
    input,
    encoding: 'utf8',
    env: { ...process.env, HERDR_PLUGIN_STATE_DIR: d, ...extraEnv },
  });
}

test('panel line mode: add-mode auto-jump persists a link and reports', () => {
  const d = tmp();
  const stub = makeStub(d, '{}');
  fs.writeFileSync(path.join(d, 'pending.json'),
    JSON.stringify({ workspaceId: 'w1', label: 'web', mode: 'add' }));
  const res = runPanel(d, 'https://x.dev\nMy title\n', { HERDR_BIN_PATH: stub });
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /URL: /);
  assert.match(res.stdout, /Title \[x\.dev\]: /);
  assert.deepEqual(sl.readState(d).w1.links, [{ title: 'My title', url: 'https://x.dev' }]);
  const calls = fs.readFileSync(path.join(d, 'calls.log'), 'utf8').trim().split('\n');
  assert.equal(calls.filter((c) => c.includes('report-metadata')).length, 1);
});
test('panel line mode: cancel from add-mode auto-jump lands on menu, writes nothing', () => {
  const d = tmp();
  const stub = makeStub(d, '{}');
  fs.writeFileSync(path.join(d, 'pending.json'),
    JSON.stringify({ workspaceId: 'w1', label: 'web', mode: 'add' }));
  const res = runPanel(d, '\nq\n', { HERDR_BIN_PATH: stub });
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /URL: /);
  assert.doesNotMatch(res.stdout, /Title \[/);
  assert.equal(sl.readState(d).w1, undefined);
  assert.equal(fs.existsSync(path.join(d, 'calls.log')), false);
  assert.match(res.stdout, /a — add · <n> — open · d <n> — delete · q — close/);
});
test('panel line mode: stored >9 shows scroll indicator instead of a dead end', () => {
  const d = tmp();
  const stub = makeStub(d, '{}');
  const twelve = Array.from({ length: 12 }, (_, i) => ({ title: 't' + i, url: 'https://x.dev/' + i }));
  sl.writeState(d, { w1: { label: 'web', links: twelve } });
  fs.writeFileSync(path.join(d, 'pending.json'), JSON.stringify({ workspaceId: 'w1', label: 'web' }));
  const res = runPanel(d, 'q\n', { HERDR_BIN_PATH: stub });
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /↓ 3 below/);
  assert.doesNotMatch(res.stdout, /showing first 9/);
});

// --- popup frame rendering (cursor marker, armed digits, honest footer) ---
test('panelFrame renders cursor marker, armed inverse digits, scroll hints', () => {
  const links = [
    { title: 'A', url: 'https://a.dev' },
    { title: 'B', url: 'https://b.dev' },
  ];
  const frame = sl.panelFrame('w1', 'web', links, null, {
    armed: true, keyMode: true, cursor: 1, windowStart: 0,
  });
  assert.match(frame, /Space links — web /);
  assert.match(frame, /delete which\? 1\.\.2 · enter = selected · esc cancels/);
  assert.match(frame, /\x1b\[7m1\x1b\[27m\. ↳ A/);
  assert.match(frame, /\x1b\[7m2\x1b\[27m\. ↳ B/);
  assert.match(frame, /› /);
  const empty = sl.panelFrame('w1', 'web', [], null, { keyMode: true });
  assert.match(empty, /a add · q close/);
  assert.match(empty, /\(none yet\)/);
  const scrolled = sl.panelFrame('w1', 'web', Array.from({ length: 12 }, (_, i) => ({
    title: 't' + i, url: 'https://x.dev/' + i,
  })), null, { keyMode: true, cursor: 10, windowStart: 3 });
  assert.match(scrolled, /↑ 3 above/);
  assert.doesNotMatch(scrolled, /below/);   // indicator only when rows remain below the window
});
test('isTTY distinguishes pipes from ttys', () => {
  const { PassThrough } = require('node:stream');
  assert.equal(sl.isTTY(new PassThrough()), false);
  assert.equal(sl.isTTY({ isTTY: true, setRawMode() {} }), true);
  assert.equal(sl.isTTY(undefined), false);
});
test('menuKey: modified chords never act as bare letters', () => {
  assert.deepEqual(sl.menuKey(false, { name: 'd', ctrl: true }), { op: 'quit' }); // EOF convention
  assert.deepEqual(sl.menuKey(false, { name: 'a', ctrl: true }), { op: 'noop' });
  assert.deepEqual(sl.menuKey(false, { name: 'q', meta: true }), { op: 'noop' });
  assert.deepEqual(sl.menuKey(false, { name: 'c', ctrl: true }), { op: 'quit' });
  assert.deepEqual(sl.menuKey(true, { name: 'a', ctrl: true }), { op: 'disarm' });
});
test('promptLine resolves with the typed line, not eof', async () => {
  const { PassThrough } = require('node:stream');
  const input = new PassThrough();
  const output = new PassThrough();
  const p = sl.promptLine(input, output, 'P: ');
  input.write('hello\n');
  assert.deepEqual(await p, { eof: false, answer: 'hello' });
});

// --- Task 4: focus republish hook ---
test('refreshFocused reports stored workspace from event JSON', () => {
  const d = tmp();
  const stub = makeStub(d, '{}');
  sl.writeState(d, { w1: { label: 'web', links: [{ title: 'A', url: 'https://a.dev' }] } });
  process.env.HERDR_BIN_PATH = stub;
  const r = sl.refreshFocused({ HERDR_PLUGIN_EVENT_JSON: '{"workspace_id":"w1"}' }, d, (a) => sl.herdrRun(a));
  delete process.env.HERDR_BIN_PATH;
  assert.deepEqual(r, { ok: true });
  assert.match(fs.readFileSync(path.join(d, 'calls.log'), 'utf8'), /report-metadata w1/);
});
test('refreshFocused: nested id, env fallback, corrupt JSON all resolve', () => {
  const d = tmp();
  const stub = makeStub(d, '{}');
  sl.writeState(d, { w1: { label: 'web', links: [] } });
  process.env.HERDR_BIN_PATH = stub;
  const nested = sl.refreshFocused({ HERDR_PLUGIN_EVENT_JSON: '{"workspace":{"workspace_id":"w1"}}' }, d, (a) => sl.herdrRun(a));
  const envfb = sl.refreshFocused({ HERDR_WORKSPACE_ID: 'w1' }, d, (a) => sl.herdrRun(a));
  const corrupt = sl.refreshFocused({ HERDR_PLUGIN_EVENT_JSON: '{oops', HERDR_WORKSPACE_ID: 'w1' }, d, (a) => sl.herdrRun(a));
  delete process.env.HERDR_BIN_PATH;
  assert.deepEqual([nested.ok, envfb.ok, corrupt.ok], [true, true, true]);
  const calls = fs.readFileSync(path.join(d, 'calls.log'), 'utf8').split('\n');
  assert.equal(calls.filter((c) => c.includes('report-metadata w1')).length, 3);
});
test('refreshFocused skips unknown workspaces and id-less events', () => {
  const d = tmp();
  const stub = makeStub(d, '{}');
  sl.writeState(d, { w1: { label: 'web', links: [] } });
  process.env.HERDR_BIN_PATH = stub;
  const unknown = sl.refreshFocused({ HERDR_PLUGIN_EVENT_JSON: '{"workspace_id":"w9"}' }, d, (a) => sl.herdrRun(a));
  const idless = sl.refreshFocused({}, d, (a) => sl.herdrRun(a));
  delete process.env.HERDR_BIN_PATH;
  assert.deepEqual(unknown, { ok: true, skipped: 'no links stored' });
  assert.deepEqual(idless, { ok: true, skipped: 'no workspace id' });
  assert.equal(fs.existsSync(path.join(d, 'calls.log')), false);
});
test('refreshFocused throws when the report fails', () => {
  const d = tmp();
  const stub = makeStub(d, '', true);
  sl.writeState(d, { w1: { label: 'web', links: [] } });
  process.env.HERDR_BIN_PATH = stub;
  assert.throws(() => sl.refreshFocused({ HERDR_PLUGIN_EVENT_JSON: '{"workspace_id":"w1"}' }, d, (a) => sl.herdrRun(a)), /boom|report-metadata/);
  delete process.env.HERDR_BIN_PATH;
});

// --- key-driver flows on a fake TTY (in-process panelMain) ---
const { PassThrough } = require('node:stream');
const tick = (ms = 12) => new Promise((r) => setTimeout(r, ms));

async function drivePanel(d, chunks, { links = null, mode = 'open' } = {}) {
  const input = new PassThrough();
  input.isTTY = true;
  input.setRawMode = () => {};
  const output = new PassThrough();
  const frames = [];
  output.on('data', (c) => frames.push(c.toString('utf8')));
  if (links) sl.writeState(d, { w1: { label: 'web', links } });
  fs.writeFileSync(path.join(d, 'pending.json'),
    JSON.stringify({ workspaceId: 'w1', label: 'web', mode }));
  const opened = [];
  const stub = makeStub(d, '{}');
  process.env.HERDR_BIN_PATH = stub;
  const p = sl.panelMain({
    env: { ...process.env, HERDR_PLUGIN_STATE_DIR: d, HERDR_BIN_PATH: stub },
    stdin: input, stdout: output,
    openExternal: (u) => opened.push(u),
  });
  for (const chunk of chunks) {
    await tick();
    input.write(chunk);
  }
  // Always close the panel: 'q' disarms when armed, so a second 'q' quits.
  // Extra writes after the driver already exited just sit in the buffer.
  for (const chunk of ['q', 'q']) {
    await tick();
    input.write(chunk);
  }
  await p;
  delete process.env.HERDR_BIN_PATH;
  return { text: frames.join(''), frames, opened };
}

test('key mode: errors are transient, footer is honest, armed digits highlighted', async () => {
  const d = tmp();
  const { frames } = await drivePanel(d, ['9', 'd'], {
    links: [{ title: 'A', url: 'https://a.dev' }],
  });
  const errored = frames.find((f) => f.includes('✗ no link 9'));
  assert.ok(errored, 'out-of-range digit shows a gentle error');
  const armed = frames.find((f) => f.includes('delete which?'));
  assert.ok(armed, 'd arms delete mode');
  assert.doesNotMatch(armed, /no link 9/);          // error cleared by the next key
  assert.match(armed, /delete which\? 1 · enter = selected · esc cancels/);
  assert.match(armed, /\x1b\[7m1\x1b\[27m\. ↳ A/); // armed digit highlighted
});

test('key mode: unknown keys are silent, status clears on next key', async () => {
  const d = tmp();
  const { frames } = await drivePanel(d, ['x', 'd', '2', 'j'], {
    links: [
      { title: 'A', url: 'https://a.dev' },
      { title: 'B', url: 'https://b.dev' },
    ],
  });
  assert.doesNotMatch(frames[2], /✗/);              // stray key: no scary error
  const ok = frames.findIndex((f) => f.includes('✓ deleted — ↳ B'));
  assert.ok(ok > 0, 'delete shows a success status');
  assert.doesNotMatch(frames[ok + 1], /✓ deleted/); // status clears on next key
  assert.equal(sl.readState(d).w1.links.length, 1);
  assert.equal(sl.readState(d).w1.links[0].title, 'A'); // digit 2 deleted the second row
});

test('key mode: enter opens the selected link', async () => {
  const d = tmp();
  const { opened } = await drivePanel(d, ['j', '\r'], {
    links: [
      { title: 'A', url: 'https://a.dev' },
      { title: 'B', url: 'https://b.dev' },
    ],
  });
  assert.deepEqual(opened, ['https://b.dev']);       // cursor moved down, Enter opened it
});

test('key mode: scrolling makes legacy >9 links reachable and deletable', async () => {
  const twelve = Array.from({ length: 12 }, (_, i) => ({ title: 't' + i, url: 'https://x.dev/' + i }));
  const d = tmp();
  const { frames, opened } = await drivePanel(
    d,
    [...Array(9).fill('j'), '\r'],
    { links: twelve },
  );
  const scrolled = frames.find((f) => f.includes('↑ 1 above'));
  assert.ok(scrolled, 'window scrolled by one');
  assert.deepEqual(opened, ['https://x.dev/9']);     // 10th link, previously unreachable
  const d2 = tmp();
  const r2 = await drivePanel(
    d2,
    [...Array(11).fill('j'), 'd', '9'],
    { links: twelve },
  );
  assert.equal(r2.opened.length, 0);
  const remaining = sl.readState(d2).w1.links;
  assert.equal(remaining.length, 11);
  assert.equal(remaining.some((l) => l.title === 't11'), false); // absolute 12th deleted
  assert.ok(r2.frames.some((f) => f.includes('✓ deleted — ↳ t11')));
});

test('key mode: URL-first add with derived title suggestion', async () => {
  const d = tmp();
  const { text } = await drivePanel(d, ['example.com/x\n', '\n'], { mode: 'add', links: [] });
  assert.match(text, /URL: /);
  assert.match(text, /Title \[example\.com\/x\]: /);
  const entry = sl.readState(d).w1;
  assert.deepEqual(entry.links, [{ title: 'example.com/x', url: 'https://example.com/x' }]);
  assert.match(text, /✓ added — ↳ example\.com\/x/);
});

test('key mode: custom title overrides the derived suggestion', async () => {
  const d = tmp();
  const { text } = await drivePanel(d, ['https://x.dev\n', 'My name\n'], { mode: 'add', links: [] });
  const entry = sl.readState(d).w1;
  assert.deepEqual(entry.links, [{ title: 'My name', url: 'https://x.dev' }]);
  assert.match(text, /enter open · a add · d delete · q close/);
});

// --- persist order: the frame updates before the (potentially slow) report ---
test('persistAndReport renders before the herdr report in key mode', () => {
  const d = tmp();
  const log = [];
  const output = { write: () => log.push('render') };
  const run = () => { log.push('report'); return { status: 0 }; };
  const ctx = sl.createPanelCtx({ dir: d, state: {}, workspaceId: 'w1', label: 'web', output, run });
  ctx.keyMode = true;
  ctx.persistAndReport([{ title: 'A', url: 'https://a.dev' }]);
  assert.deepEqual(log.slice(-2), ['render', 'report']);
  assert.deepEqual(sl.readState(d).w1.links, [{ title: 'A', url: 'https://a.dev' }]);
});
