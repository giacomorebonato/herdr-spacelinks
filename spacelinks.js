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

const { spawnSync } = require('node:child_process');

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
    console.error(`spacelinks: unknown subcommand ${JSON.stringify(cmd)}`);
    process.exit(1);
  } catch (err) {
    console.error(`spacelinks: ${err.message}`);
    process.exit(1);
  }
}
