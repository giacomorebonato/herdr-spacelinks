'use strict';

// spacelinks — per-Space web links in the herdr sidebar.
// Plugin per docs/superpowers/specs/2026-11-05-spacelinks-design.md.

const fs = require('node:fs');
const path = require('node:path');

const STATE_FILE = 'links.json';

const cap = (s, n) => Array.from(s).slice(0, n).join('');

function stateDir() {
  const dir = process.env.HERDR_PLUGIN_STATE_DIR;
  if (!dir) throw new Error('HERDR_PLUGIN_STATE_DIR is not set');
  return dir;
}

function readState(dir) {
  const file = path.join(dir, STATE_FILE);
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (err) {
    if (err && err.code === 'ENOENT') return {};
    throw err;
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`links.json is corrupt: ${err.message}`);
  }
}

function writeState(dir, state) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, STATE_FILE);
  const tmp = path.join(dir, `${STATE_FILE}.tmp`);
  fs.writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`);
  fs.renameSync(tmp, file);
}

function linksFor(state, workspaceId) {
  const entry = state[workspaceId];
  return entry && Array.isArray(entry.links) ? entry.links : [];
}

function normalizeUrl(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return null;
  const candidate = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  let url;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  return candidate;
}

function deriveTitle(url) {
  let title = String(url || '').replace(/^https?:\/\//, '');
  if (title.endsWith('/')) title = title.slice(0, -1);
  return cap(title, 78);
}

function tokenValue(title) {
  return cap(`↳ ${title}`, 80);
}

const MAX_LINKS = 9;
const CLEAR_TOKENS = 14;

function visibleLinks(links) {
  return links.slice(0, MAX_LINKS);
}

const KEY_ERROR = 'unknown key — 1..9 open · a add · d delete · q/esc close';

function menuKey(armed, key) {
  const name = key && key.name ? String(key.name).toLowerCase() : '';
  if (key && key.ctrl && (name === 'c' || name === 'd')) return { op: 'quit' };
  if (key && (key.ctrl || key.meta)) {
    return armed ? { op: 'disarm' } : { op: 'error', message: KEY_ERROR };
  }
  if (armed) {
    if (/^[1-9]$/.test(name)) return { op: 'delete', n: parseInt(name, 10) };
    return { op: 'disarm' };
  }
  if (name === 'q' || name === 'escape') return { op: 'quit' };
  if (name === 'a') return { op: 'add' };
  if (name === 'd') return { op: 'arm' };
  if (/^[1-9]$/.test(name)) return { op: 'open', n: parseInt(name, 10) };
  return { op: 'error', message: KEY_ERROR };
}

function promptLine(input, output, prompt) {
  return new Promise((resolve) => {
    let settled = false;
    const rl = readline.createInterface({ input, output });
    rl.on('close', () => { if (!settled) resolve({ eof: true, answer: '' }); });
    rl.question(prompt, (a) => {
      settled = true;
      resolve({ eof: false, answer: a });
      rl.close();
    });
  });
}

function addLink(links, title, url) {
  const normalized = normalizeUrl(url);
  if (!normalized) return { ok: false, message: 'not a valid http(s) URL', links };
  if (links.length >= MAX_LINKS) {
    return { ok: false, message: `space link limit reached (${MAX_LINKS})`, links };
  }
  const finalTitle = String(title || '').trim() || deriveTitle(normalized);
  return { ok: true, message: 'added', links: [...links, { title: finalTitle, url: normalized }] };
}

function removeLink(links, n) {
  if (!Number.isInteger(n) || n < 1 || n > links.length) {
    return { ok: false, message: `no link ${n}`, links };
  }
  return { ok: true, message: 'deleted', links: links.filter((_, i) => i !== n - 1) };
}

function planReport(links) {
  const sets = visibleLinks(links).map((link, i) => ({
    name: `spacelink_${i + 1}`,
    value: tokenValue(link.title),
  }));
  const clears = [];
  for (let i = sets.length; i < CLEAR_TOKENS; i++) clears.push(`spacelink_${i + 1}`);
  return { sets, clears };
}

const { spawn, spawnSync } = require('node:child_process');
const readline = require('node:readline');

function herdrRun(args, opts = {}) {
  const bin = process.env.HERDR_BIN_PATH || 'herdr';
  return spawnSync(bin, args, {
    encoding: 'utf8',
    env: { ...process.env, ...opts.env },
  });
}

function reportTokens(workspaceId, links, run) {
  const { sets, clears } = planReport(links);
  const args = ['workspace', 'report-metadata', workspaceId, '--source', 'plugin:spacelinks'];
  for (const s of sets) args.push('--token', `${s.name}=${s.value}`);
  for (const c of clears) args.push('--clear-token', c);
  const res = run(args);
  if (res.status !== 0) throw new Error((res.stderr && res.stderr.trim()) || 'workspace report-metadata failed');
}

function applyAll(stateDir, run) {
  const state = readState(stateDir);
  if (Object.keys(state).length === 0) return { reported: 0, failed: 0 };
  const listRes = run(['workspace', 'list']);
  if (listRes.status !== 0) {
    throw new Error((listRes.stderr && listRes.stderr.trim()) || 'workspace list failed');
  }
  let workspaces;
  try {
    workspaces = JSON.parse(listRes.stdout).result.workspaces;
  } catch {
    throw new Error('unexpected workspace list output');
  }
  let reported = 0;
  let failed = 0;
  for (const ws of workspaces) {
    const entry = state[ws.workspace_id];
    if (!entry) continue;
    try {
      reportTokens(ws.workspace_id, linksFor(state, ws.workspace_id), run);
      reported += 1;
    } catch {
      failed += 1;
    }
    entry.label = ws.label;
  }
  writeState(stateDir, state);
  return { reported, failed };
}

function openAction(stateDir, workspaceId, label, run, mode = 'open') {
  const pending = { workspaceId, label: label || workspaceId, mode: mode === 'add' ? 'add' : 'open' };
  fs.mkdirSync(stateDir, { recursive: true });
  const tmpPending = path.join(stateDir, 'pending.json.tmp');
  fs.writeFileSync(tmpPending, `${JSON.stringify(pending)}\n`);
  fs.renameSync(tmpPending, path.join(stateDir, 'pending.json'));
  const res = run(['plugin', 'pane', 'open', '--plugin', 'spacelinks', '--entrypoint', 'panel']);
  if (res.status !== 0) {
    const detail = (res.stderr && res.stderr.trim()) || 'no stderr';
    throw new Error(`popup already open, or server busy: ${detail}`);
  }
}

function parseCommand(line) {
  const t = String(line || '').trim().toLowerCase();
  if (t === '') return { op: 'redraw' };
  if (t === 'a') return { op: 'add' };
  if (t === 'q' || t === 'quit') return { op: 'quit' };
  if (/^\d+$/.test(t)) return { op: 'open', n: parseInt(t, 10) };
  const m = t.match(/^d\s+(\d+)$/);
  if (m) return { op: 'delete', n: parseInt(m[1], 10) };
  return { op: 'error', message: 'unknown command — a=add, <n>=open, d <n>=delete, q=close' };
}

function openExternal(url) {
  const child = process.platform === 'darwin'
    ? spawn('open', [url], { detached: true, stdio: 'ignore' })
    : process.platform === 'win32'
      ? spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' })
      : spawn('xdg-open', [url], { detached: true, stdio: 'ignore' });
  child.unref();
}

function isTTY(stdin) {
  return !!(stdin && stdin.isTTY && typeof stdin.setRawMode === 'function');
}

const LINE_FOOTER = 'a — add · <n> — open · d <n> — delete · q — close';
const KEY_FOOTER = '1..9 open · a add · d delete · q/esc close';
const ARMED_FOOTER = 'delete which? 1..9 · esc cancels';

function panelFrame(workspaceId, label, links, error, opts = {}) {
  const { armed = false, keyMode = false, storedCount = links.length } = opts;
  const rows = [];
  rows.push('\x1b[2J\x1b[H');
  rows.push(`Space links — ${label} (${workspaceId})`);
  rows.push('');
  const visible = visibleLinks(links);
  if (visible.length === 0) {
    rows.push('  (none yet)');
  } else {
    visible.forEach((link, i) => {
      const text = `${i + 1}. ↳ ${link.title}`;
      rows.push(`  \x1b]8;;${link.url}\x1b\\${text}\x1b]8;;\x1b\\`);
    });
  }
  if (storedCount > visible.length) {
    rows.push(`  (${storedCount} links stored — showing first 9)`);
  }
  rows.push('');
  rows.push(keyMode ? (armed ? ARMED_FOOTER : KEY_FOOTER) : LINE_FOOTER);
  if (error) rows.push(`✗ ${error}`);
  rows.push('');
  return rows.join('\n');
}

function resolveTarget(dir, env) {
  try {
    const pending = JSON.parse(fs.readFileSync(path.join(dir, 'pending.json'), 'utf8'));
    if (pending && pending.workspaceId) {
      return {
        workspaceId: pending.workspaceId,
        label: pending.label || pending.workspaceId,
        mode: pending.mode === 'add' ? 'add' : 'open',
      };
    }
  } catch { /* fall through */ }
  try {
    const context = JSON.parse(env.HERDR_PLUGIN_CONTEXT_JSON || '{}');
    if (context && context.workspace_id) {
      return {
        workspaceId: context.workspace_id,
        label: context.workspace_label || context.workspace_id,
        mode: 'open',
      };
    }
  } catch { /* fall through */ }
  throw new Error('cannot resolve current space');
}

function createPanelCtx({ dir, state, workspaceId, label, output, run }) {
  const ctx = { dir, state, workspaceId, label, output, error: null, armed: false, keyMode: false };
  ctx.render = () => {
    const links = linksFor(state, workspaceId);
    output.write(panelFrame(workspaceId, label, links, ctx.error, {
      armed: ctx.armed,
      keyMode: ctx.keyMode,
      storedCount: links.length,
    }));
  };
  ctx.persistAndReport = (links) => {
    state[workspaceId] = { label, links };
    writeState(dir, state);
    try {
      reportTokens(workspaceId, links, run);
      ctx.error = null;
    } catch (err) {
      ctx.error = err.message;
    }
  };
  ctx.open = (n) => {
    const links = linksFor(state, workspaceId);
    if (n < 1 || n > links.length) {
      ctx.error = `no link ${n}`;
      return false;
    }
    openExternal(links[n - 1].url);
    return true;
  };
  ctx.remove = (n) => {
    const result = removeLink(linksFor(state, workspaceId), n);
    if (!result.ok) {
      ctx.error = result.message;
      return false;
    }
    ctx.persistAndReport(result.links);
    return true;
  };
  return ctx;
}

async function addFlow(ctx, askOrQuit) {
  const t = await askOrQuit('Title (Enter = derive from URL): ');
  if (t.eof) return 'eof';
  const title = String(t.answer).trim();
  const first = await askOrQuit('URL: ');
  if (first.eof) return 'eof';
  let urlLine = String(first.answer).trim();
  for (;;) {
    if (urlLine === '') return 'cancelled';
    const result = addLink(linksFor(ctx.state, ctx.workspaceId), title, urlLine);
    if (!result.ok) {
      ctx.output.write(`✗ ${result.message}\n`);
      const retry = await askOrQuit('URL: ');
      if (retry.eof) return 'eof';
      urlLine = String(retry.answer).trim();
      continue;
    }
    ctx.persistAndReport(result.links);
    return 'added';
  }
}

async function lineDriver(ctx, { input, output }, mode) {
  const rl = readline.createInterface({ input, output, terminal: false });
  const pendingLines = [];
  let lineWaiter = null;
  rl.on('line', (l) => {
    if (lineWaiter) {
      const w = lineWaiter;
      lineWaiter = null;
      w(l);
    } else {
      pendingLines.push(l);
    }
  });
  rl.on('close', () => {
    if (lineWaiter) {
      const w = lineWaiter;
      lineWaiter = null;
      w(null);
    }
  });
  const ask = (prompt) => new Promise((resolve) => {
    output.write(prompt);
    if (pendingLines.length > 0) {
      resolve(pendingLines.shift());
      return;
    }
    lineWaiter = (l) => resolve(l);
  });
  const askOrQuit = async (prompt) => {
    const answer = await ask(prompt);
    if (answer === null) {
      return { eof: true, answer: '' };
    }
    return { eof: false, answer };
  };
  if (mode === 'add') {
    const r = await addFlow(ctx, askOrQuit);
    if (r === 'eof') {
      rl.close();
      return;
    }
  }
  for (;;) {
    ctx.render();
    const menu = await askOrQuit('> ');
    if (menu.eof) return;
    const cmd = parseCommand(menu.answer);
    if (cmd.op === 'quit') {
      rl.close();
      return;
    }
    if (cmd.op === 'redraw') continue;
    if (cmd.op === 'error') {
      ctx.error = cmd.message;
      continue;
    }
    if (cmd.op === 'add') {
      const r = await addFlow(ctx, askOrQuit);
      if (r === 'eof') {
        rl.close();
        return;
      }
      continue;
    }
    if (cmd.op === 'open') {
      if (ctx.open(cmd.n)) {
        rl.close();
        return;
      }
      continue;
    }
    if (cmd.op === 'delete') {
      ctx.remove(cmd.n);
      continue;
    }
  }
}

async function keyDriver(ctx, { input, output }, mode) {
  ctx.keyMode = true;
  readline.emitKeypressEvents(input);
  let keyWaiter = null;
  let closed = false;
  const pendingKeys = [];
  let promptActive = false;
  input.on('keypress', (str, key) => {
    if (promptActive) return;
    pendingKeys.push(key || { name: str });
    if (keyWaiter) {
      const w = keyWaiter;
      keyWaiter = null;
      w();
    }
  });
  input.on('close', () => {
    closed = true;
    if (keyWaiter) {
      const w = keyWaiter;
      keyWaiter = null;
      w(null);
    }
  });
  const cooked = () => { try { input.setRawMode(false); } catch { /* already gone */ } };
  const rearmRaw = () => { try { input.setRawMode(true); } catch { /* already gone */ } };
  const nextKey = () => new Promise((resolve) => {
    const drain = () => {
      if (pendingKeys.length > 0) return resolve(pendingKeys.shift());
      if (closed) return resolve(null);
      keyWaiter = drain;
    };
    drain();
  });
  const askOrQuit = (prompt) => {
    promptActive = true;
    return promptLine(input, output, prompt).finally(() => {
      promptActive = false;
      rearmRaw();
    });
  };
  input.setRawMode(true);

  if (mode === 'add' || linksFor(ctx.state, ctx.workspaceId).length === 0) {
    await addFlow(ctx, askOrQuit);
    if (closed) { cooked(); return; }
  }
  for (;;) {
    ctx.render();
    const key = await nextKey();
    if (key === null) { cooked(); return; }
    const act = menuKey(ctx.armed, key);
    ctx.armed = act.op === 'arm';
    if (act.op === 'quit') { cooked(); return; }
    if (act.op === 'add') {
      await addFlow(ctx, askOrQuit);
      if (closed) { cooked(); return; }
      continue;
    }
    if (act.op === 'open') {
      if (ctx.open(act.n)) { cooked(); return; }
      continue;
    }
    if (act.op === 'delete') {
      ctx.remove(act.n);
      continue;
    }
    if (act.op === 'error') {
      ctx.error = act.message;
      continue;
    }
    // arm/disarm: fall through, next render shows the swapped footer
  }
}

async function panelMain(opts = {}) {
  const env = opts.env || process.env;
  const input = opts.stdin || process.stdin;
  const output = opts.stdout || process.stdout;
  const dir = env.HERDR_PLUGIN_STATE_DIR;
  if (!dir) throw new Error('HERDR_PLUGIN_STATE_DIR is not set');
  const { workspaceId, label, mode } = resolveTarget(dir, env);

  let state;
  try {
    state = readState(dir);
  } catch {
    output.write('links.json is corrupt — fix or remove it\n');
    process.exit(1);
  }

  const ctx = createPanelCtx({ dir, state, workspaceId, label, output, run: herdrRun });
  if (isTTY(input)) return keyDriver(ctx, { input, output }, mode);
  return lineDriver(ctx, { input, output }, mode);
}

function refreshFocused(env, dir, run) {
  let ev = null;
  try {
    ev = JSON.parse(env.HERDR_PLUGIN_EVENT_JSON || '{}');
  } catch {
    ev = null;
  }
  const wsId = (ev && (ev.workspace_id || (ev.workspace && ev.workspace.workspace_id)))
    || env.HERDR_WORKSPACE_ID
    || null;
  if (!wsId) return { ok: true, skipped: 'no workspace id' };
  const state = readState(dir);
  if (!state[wsId]) return { ok: true, skipped: 'no links stored' };
  reportTokens(wsId, linksFor(state, wsId), run);
  return { ok: true };
}

module.exports = {
  stateDir,
  readState,
  writeState,
  linksFor,
  normalizeUrl,
  deriveTitle,
  tokenValue,
  addLink,
  removeLink,
  visibleLinks,
  menuKey,
  planReport,
  herdrRun,
  reportTokens,
  applyAll,
  openAction,
  parseCommand,
  openExternal,
  isTTY,
  promptLine,
  refreshFocused,
  panelMain,
};

if (require.main === module) {
  const cmd = process.argv[2];
  const openFromContext = (mode) => {
    let workspaceId;
    let label;
    try {
      const context = JSON.parse(process.env.HERDR_PLUGIN_CONTEXT_JSON || '{}');
      workspaceId = context.workspace_id;
      label = context.workspace_label;
    } catch {
      workspaceId = undefined;
    }
    if (!workspaceId) throw new Error('cannot resolve current space from context');
    openAction(stateDir(), workspaceId, label, herdrRun, mode);
    process.exit(0);
  };
  try {
    if (cmd === 'apply') {
      const { reported, failed } = applyAll(stateDir(), herdrRun);
      if (failed > 0) {
        console.error(`spacelinks apply: ${failed} workspace report(s) failed (${reported} ok)`);
        process.exit(1);
      }
      process.exit(0);
    }
    if (cmd === 'open') {
      openFromContext('open');
      return;
    }
    if (cmd === 'add') {
      openFromContext('add');
      return;
    }
    if (cmd === 'refresh') {
      refreshFocused(process.env, stateDir(), herdrRun);
      process.exit(0);
    }
    if (cmd === 'panel') {
      panelMain({ env: process.env })
        .then(() => process.exit(0))
        .catch((err) => {
          console.error(`spacelinks: ${err.message}`);
          process.exit(1);
        });
      return;
    }
    console.error(`spacelinks: unknown subcommand ${JSON.stringify(cmd)}`);
    process.exit(1);
  } catch (err) {
    console.error(`spacelinks: ${err.message}`);
    process.exit(1);
  }
}
