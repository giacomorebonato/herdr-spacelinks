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
  const res = runPanel(d, 'My title\nhttps://x.dev\n', { HERDR_BIN_PATH: stub });
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /Title \(Enter = derive from URL\):/);
  assert.deepEqual(sl.readState(d).w1.links, [{ title: 'My title', url: 'https://x.dev' }]);
  const calls = fs.readFileSync(path.join(d, 'calls.log'), 'utf8').trim().split('\n');
  assert.equal(calls.filter((c) => c.includes('report-metadata')).length, 1);
});
test('panel line mode: cancel from add-mode auto-jump lands on menu, writes nothing', () => {
  const d = tmp();
  const stub = makeStub(d, '{}');
  fs.writeFileSync(path.join(d, 'pending.json'),
    JSON.stringify({ workspaceId: 'w1', label: 'web', mode: 'add' }));
  const res = runPanel(d, '\n\nq\n', { HERDR_BIN_PATH: stub });
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /Title \(Enter = derive from URL\):/);
  assert.equal(sl.readState(d).w1, undefined);
  assert.equal(fs.existsSync(path.join(d, 'calls.log')), false);
  assert.match(res.stdout, /a — add · <n> — open · d <n> — delete · q — close/);
});
test('panel line mode: stored >9 shows warning line', () => {
  const d = tmp();
  const stub = makeStub(d, '{}');
  const twelve = Array.from({ length: 12 }, (_, i) => ({ title: 't' + i, url: 'https://x.dev/' + i }));
  sl.writeState(d, { w1: { label: 'web', links: twelve } });
  fs.writeFileSync(path.join(d, 'pending.json'), JSON.stringify({ workspaceId: 'w1', label: 'web' }));
  const res = runPanel(d, 'q\n', { HERDR_BIN_PATH: stub });
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /showing first 9/);
  assert.match(res.stdout, /12 links stored/);
});
test('isTTY distinguishes pipes from ttys', () => {
  const { PassThrough } = require('node:stream');
  assert.equal(sl.isTTY(new PassThrough()), false);
  assert.equal(sl.isTTY({ isTTY: true, setRawMode() {} }), true);
  assert.equal(sl.isTTY(undefined), false);
});
test('menuKey: modified chords never act as bare letters', () => {
  assert.deepEqual(sl.menuKey(false, { name: 'd', ctrl: true }), { op: 'quit' }); // EOF convention
  assert.deepEqual(sl.menuKey(false, { name: 'a', ctrl: true }).op, 'error');
  assert.deepEqual(sl.menuKey(false, { name: 'q', meta: true }).op, 'error');
  assert.deepEqual(sl.menuKey(false, { name: 'c', ctrl: true }), { op: 'quit' });
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
