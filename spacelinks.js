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

module.exports = {
  stateDir,
  readState,
  writeState,
  linksFor,
  normalizeUrl,
  deriveTitle,
  tokenValue,
};
