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
