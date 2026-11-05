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
  assert.deepEqual(pending, { workspaceId: 'w2', label: 'web-dashboard' });
  const calls = fs.readFileSync(path.join(d, 'calls.log'), 'utf8');
  assert.match(calls, /plugin pane open --plugin spacelinks --entrypoint panel/);
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
