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

const MAX_LINKS = 14;

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
  const count = Math.min(links.length, MAX_LINKS);
  const sets = links.slice(0, MAX_LINKS).map((link, i) => ({
    name: `spacelink_${i + 1}`,
    value: tokenValue(link.title),
  }));
  const clears = [];
  for (let i = count; i < MAX_LINKS; i++) clears.push(`spacelink_${i + 1}`);
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

function openAction(stateDir, workspaceId, label, run) {
  const pending = { workspaceId, label: label || workspaceId };
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

function panelFrame(workspaceId, label, links, error) {
  const rows = [];
  rows.push('\x1b[2J\x1b[H');
  rows.push(`Space links — ${label} (${workspaceId})`);
  rows.push('');
  if (links.length === 0) {
    rows.push('  (none yet)');
  } else {
    links.forEach((link, i) => {
      const text = `${i + 1}. ↳ ${link.title}`;
      rows.push(`  \x1b]8;;${link.url}\x1b\\${text}\x1b]8;;\x1b\\`);
    });
  }
  rows.push('');
  rows.push('a — add · <n> — open · d <n> — delete · q — close');
  if (error) rows.push(`✗ ${error}`);
  rows.push('');
  return rows.join('\n');
}

function resolveTarget(dir, env) {
  try {
    const pending = JSON.parse(fs.readFileSync(path.join(dir, 'pending.json'), 'utf8'));
    if (pending && pending.workspaceId) {
      return { workspaceId: pending.workspaceId, label: pending.label || pending.workspaceId };
    }
  } catch { /* fall through */ }
  try {
    const context = JSON.parse(env.HERDR_PLUGIN_CONTEXT_JSON || '{}');
    if (context && context.workspace_id) {
      return { workspaceId: context.workspace_id, label: context.workspace_label || context.workspace_id };
    }
  } catch { /* fall through */ }
  throw new Error('cannot resolve current space');
}

async function panelMain(opts = {}) {
  const env = opts.env || process.env;
  const input = opts.stdin || process.stdin;
  const output = opts.stdout || process.stdout;
  const dir = env.HERDR_PLUGIN_STATE_DIR;
  if (!dir) throw new Error('HERDR_PLUGIN_STATE_DIR is not set');
  const { workspaceId, label } = resolveTarget(dir, env);

  let state;
  try {
    state = readState(dir);
  } catch {
    output.write('links.json is corrupt — fix or remove it\n');
    process.exit(1);
  }

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
      rl.close();
      return { eof: true, answer: '' };
    }
    return { eof: false, answer };
  };
  let error = null;

  const persistAndReport = (links) => {
    state[workspaceId] = { label, links };
    writeState(dir, state);
    try {
      reportTokens(workspaceId, links, herdrRun);
      error = null;
    } catch (err) {
      error = err.message;
    }
  };

  for (;;) {
    output.write(panelFrame(workspaceId, label, linksFor(state, workspaceId), error));
    const menu = await askOrQuit('> ');
    if (menu.eof) return;
    const cmd = parseCommand(menu.answer);
    if (cmd.op === 'quit') {
      rl.close();
      return;
    }
    if (cmd.op === 'redraw') {
      continue;
    }
    if (cmd.op === 'error') {
      error = cmd.message;
      continue;
    }
    if (cmd.op === 'add') {
      const t = await askOrQuit('Title (Enter = derive from URL): ');
      if (t.eof) return;
      const title = String(t.answer).trim();
      const first = await askOrQuit('URL: ');
      if (first.eof) return;
      let urlLine = String(first.answer).trim();
      for (;;) {
        if (urlLine === '') break;
        const result = addLink(linksFor(state, workspaceId), title, urlLine);
        if (!result.ok) {
          output.write(`✗ ${result.message}\n`);
          const retry = await askOrQuit('URL: ');
          if (retry.eof) return;
          urlLine = String(retry.answer).trim();
          continue;
        }
        persistAndReport(result.links);
        break;
      }
      continue;
    }
    if (cmd.op === 'open') {
      const links = linksFor(state, workspaceId);
      if (cmd.n < 1 || cmd.n > links.length) {
        error = `no link ${cmd.n}`;
        continue;
      }
      openExternal(links[cmd.n - 1].url);
      rl.close();
      return;
    }
    if (cmd.op === 'delete') {
      const result = removeLink(linksFor(state, workspaceId), cmd.n);
      if (!result.ok) {
        error = result.message;
        continue;
      }
      persistAndReport(result.links);
      continue;
    }
  }
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
  planReport,
  herdrRun,
  reportTokens,
  applyAll,
  openAction,
  parseCommand,
  openExternal,
  panelMain,
};

if (require.main === module) {
  const cmd = process.argv[2];
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
      openAction(stateDir(), workspaceId, label, herdrRun);
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
