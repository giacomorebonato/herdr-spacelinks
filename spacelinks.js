'use strict';
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.isLink = isLink;
exports.isSpaceEntry = isSpaceEntry;
exports.isLinksState = isLinksState;
exports.stateDir = stateDir;
exports.readState = readState;
exports.writeState = writeState;
exports.linksFor = linksFor;
exports.normalizeUrl = normalizeUrl;
exports.deriveTitle = deriveTitle;
exports.tokenValue = tokenValue;
exports.visibleLinks = visibleLinks;
exports.addLink = addLink;
exports.removeLink = removeLink;
exports.menuKey = menuKey;
exports.clampView = clampView;
exports.planReport = planReport;
exports.herdrRun = herdrRun;
exports.reportTokens = reportTokens;
exports.applyAll = applyAll;
exports.openAction = openAction;
exports.parseCommand = parseCommand;
exports.openExternal = openExternal;
exports.isTTY = isTTY;
exports.keyFooter = keyFooter;
exports.panelFrame = panelFrame;
exports.resolveTarget = resolveTarget;
exports.createPanelCtx = createPanelCtx;
exports.addFlow = addFlow;
exports.promptLine = promptLine;
exports.panelMain = panelMain;
exports.refreshFocused = refreshFocused;
// spacelinks — per-Space web links in the herdr sidebar.
// Plugin per docs/superpowers/specs/2026-11-05-spacelinks-design.md
// and the 2026-11-06 TUI smoothing addendum.
//
// TypeScript is the source of truth; `npm run build` compiles this file to
// plain CommonJS `spacelinks.js`, which is what herdr runs (`node spacelinks.js`).
// The compiled artifact is committed so the plugin still installs from GitHub
// with zero runtime dependencies and no Bun/tsc on the user's machine.
const node_child_process_1 = require("node:child_process");
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
const readline = __importStar(require("node:readline"));
// ---------------------------------------------------------------------------
// Small helpers + runtime type guards for untrusted JSON
// ---------------------------------------------------------------------------
function errorMessage(err) {
    return err instanceof Error ? err.message : String(err);
}
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isLink(value) {
    return isRecord(value)
        && typeof value['title'] === 'string'
        && typeof value['url'] === 'string';
}
function isSpaceEntry(value) {
    if (!isRecord(value))
        return false;
    const label = value['label'];
    if (label !== undefined && typeof label !== 'string')
        return false;
    const links = value['links'];
    return Array.isArray(links) && links.every(isLink);
}
/** State files are untrusted input (hand-edited, older versions) — validate. */
function isLinksState(value) {
    return isRecord(value) && Object.values(value).every(isSpaceEntry);
}
function isPendingTarget(value) {
    if (!isRecord(value))
        return false;
    const workspaceId = value['workspaceId'];
    const label = value['label'];
    const mode = value['mode'];
    return typeof workspaceId === 'string'
        && (label === undefined || typeof label === 'string')
        && (mode === undefined || mode === 'open' || mode === 'add');
}
function isPluginContext(value) {
    if (!isRecord(value))
        return false;
    const id = value['workspace_id'];
    const label = value['workspace_label'];
    return (id === undefined || typeof id === 'string')
        && (label === undefined || typeof label === 'string');
}
function isWorkspaceListResult(value) {
    if (!isRecord(value))
        return false;
    const result = value['result'];
    if (!isRecord(result))
        return false;
    const workspaces = result['workspaces'];
    if (!Array.isArray(workspaces))
        return false;
    return workspaces.every((ws) => isRecord(ws)
        && typeof ws['workspace_id'] === 'string'
        && typeof ws['label'] === 'string');
}
function isFocusedEvent(value) {
    if (!isRecord(value))
        return false;
    const id = value['workspace_id'];
    const workspace = value['workspace'];
    const nested = isRecord(workspace) ? workspace['workspace_id'] : undefined;
    return (id === undefined || typeof id === 'string')
        && (nested === undefined || typeof nested === 'string');
}
// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
const STATE_FILE = 'links.json';
function cap(s, n) {
    return Array.from(s).slice(0, n).join('');
}
function stateDir() {
    const dir = process.env['HERDR_PLUGIN_STATE_DIR'];
    if (!dir)
        throw new Error('HERDR_PLUGIN_STATE_DIR is not set');
    return dir;
}
function readState(dir) {
    const file = path.join(dir, STATE_FILE);
    let raw;
    try {
        raw = fs.readFileSync(file, 'utf8');
    }
    catch (err) {
        if (err instanceof Error && err.code === 'ENOENT')
            return {};
        throw err;
    }
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch (err) {
        throw new Error(`links.json is corrupt: ${errorMessage(err)}`);
    }
    if (!isLinksState(parsed)) {
        throw new Error('links.json is corrupt: unexpected shape');
    }
    return parsed;
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
// ---------------------------------------------------------------------------
// URL / link logic
// ---------------------------------------------------------------------------
function normalizeUrl(raw) {
    const trimmed = String(raw || '').trim();
    if (!trimmed)
        return null;
    const candidate = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)
        ? trimmed
        : `https://${trimmed}`;
    let url;
    try {
        url = new URL(candidate);
    }
    catch {
        return null;
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:')
        return null;
    return candidate;
}
function deriveTitle(url) {
    let title = String(url || '').replace(/^https?:\/\//, '');
    if (title.endsWith('/'))
        title = title.slice(0, -1);
    return cap(title, 78);
}
function tokenValue(title) {
    return cap(`↳ ${title}`, 80);
}
const MAX_LINKS = 9; // sidebar rows + add cap
const CLEAR_TOKENS = 14; // legacy configs may still reference 14 token rows
const WINDOW = 9; // popup rows per frame; digits address these
function visibleLinks(links) {
    return links.slice(0, MAX_LINKS);
}
function addLink(links, title, url) {
    const normalized = normalizeUrl(url);
    if (!normalized)
        return { ok: false, message: 'not a valid http(s) URL', links };
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
// ---------------------------------------------------------------------------
// Menu state machine + view
// ---------------------------------------------------------------------------
// Single-key menu state machine. Unknown keys are silent no-ops: the footer
// already documents the contract, and a scary error for every stray keypress
// made the popup feel punitive. Digits address the *visible window* rows;
// the driver maps them to absolute link indices.
function menuKey(armed, key) {
    const name = key && key.name ? String(key.name).toLowerCase() : '';
    if (key && key.ctrl && (name === 'c' || name === 'd'))
        return { op: 'quit' };
    if (key && (key.ctrl || key.meta))
        return armed ? { op: 'disarm' } : { op: 'noop' };
    if (armed) {
        if (/^[1-9]$/.test(name))
            return { op: 'delete', n: parseInt(name, 10) };
        if (name === 'enter' || name === 'return')
            return { op: 'delete-selected' };
        if (name === 'up' || name === 'k')
            return { op: 'move', delta: -1 };
        if (name === 'down' || name === 'j')
            return { op: 'move', delta: 1 };
        return { op: 'disarm' };
    }
    if (name === 'q' || name === 'escape')
        return { op: 'quit' };
    if (name === 'a')
        return { op: 'add' };
    if (name === 'd')
        return { op: 'arm' };
    if (name === 'up' || name === 'k')
        return { op: 'move', delta: -1 };
    if (name === 'down' || name === 'j')
        return { op: 'move', delta: 1 };
    if (name === 'enter' || name === 'return')
        return { op: 'open-selected' };
    if (/^[1-9]$/.test(name))
        return { op: 'open', n: parseInt(name, 10) };
    return { op: 'noop' };
}
// Keep the cursor inside a WINDOW-sized slice of the list; used after every
// move/add/delete so selection and scrolling stay coherent.
function clampView(cursor, windowStart, len) {
    if (len <= 0)
        return { cursor: 0, windowStart: 0 };
    const c = Math.max(0, Math.min(cursor, len - 1));
    let s = Math.max(0, Math.min(windowStart, len - WINDOW));
    if (c < s)
        s = c;
    if (c > s + WINDOW - 1)
        s = c - WINDOW + 1;
    s = Math.max(0, Math.min(s, len - WINDOW));
    return { cursor: c, windowStart: s };
}
function planReport(links) {
    const sets = visibleLinks(links).map((link, i) => ({
        name: `spacelink_${i + 1}`,
        value: tokenValue(link.title),
    }));
    const clears = [];
    for (let i = sets.length; i < CLEAR_TOKENS; i++)
        clears.push(`spacelink_${i + 1}`);
    return { sets, clears };
}
// ---------------------------------------------------------------------------
// herdr CLI boundary
// ---------------------------------------------------------------------------
function herdrRun(args, opts = {}) {
    const bin = process.env['HERDR_BIN_PATH'] || 'herdr';
    return (0, node_child_process_1.spawnSync)(bin, args, {
        encoding: 'utf8',
        env: { ...process.env, ...opts.env },
    });
}
function reportTokens(workspaceId, links, run) {
    const { sets, clears } = planReport(links);
    const args = ['workspace', 'report-metadata', workspaceId, '--source', 'plugin:spacelinks'];
    for (const s of sets)
        args.push('--token', `${s.name}=${s.value}`);
    for (const c of clears)
        args.push('--clear-token', c);
    const res = run(args);
    if (res.status !== 0) {
        throw new Error((res.stderr && res.stderr.trim()) || 'workspace report-metadata failed');
    }
}
function applyAll(dir, run) {
    const state = readState(dir);
    if (Object.keys(state).length === 0)
        return { reported: 0, failed: 0 };
    const listRes = run(['workspace', 'list']);
    if (listRes.status !== 0) {
        throw new Error((listRes.stderr && listRes.stderr.trim()) || 'workspace list failed');
    }
    let parsed;
    try {
        parsed = JSON.parse(listRes.stdout);
    }
    catch {
        throw new Error('unexpected workspace list output');
    }
    if (!isWorkspaceListResult(parsed)) {
        throw new Error('unexpected workspace list output');
    }
    const workspaces = parsed.result.workspaces;
    let reported = 0;
    let failed = 0;
    for (const ws of workspaces) {
        const entry = state[ws.workspace_id];
        if (!entry)
            continue;
        try {
            reportTokens(ws.workspace_id, linksFor(state, ws.workspace_id), run);
            reported += 1;
        }
        catch {
            failed += 1;
        }
        entry.label = ws.label;
    }
    writeState(dir, state);
    return { reported, failed };
}
function openAction(dir, workspaceId, label, run, mode = 'open') {
    const pending = {
        workspaceId,
        label: label || workspaceId,
        mode: mode === 'add' ? 'add' : 'open',
    };
    fs.mkdirSync(dir, { recursive: true });
    const tmpPending = path.join(dir, 'pending.json.tmp');
    fs.writeFileSync(tmpPending, `${JSON.stringify(pending)}\n`);
    fs.renameSync(tmpPending, path.join(dir, 'pending.json'));
    const res = run(['plugin', 'pane', 'open', '--plugin', 'spacelinks', '--entrypoint', 'panel']);
    if (res.status !== 0) {
        const detail = (res.stderr && res.stderr.trim()) || 'no stderr';
        throw new Error(`popup already open, or server busy: ${detail}`);
    }
}
function parseCommand(line) {
    const t = String(line || '').trim().toLowerCase();
    if (t === '')
        return { op: 'redraw' };
    if (t === 'a')
        return { op: 'add' };
    if (t === 'q' || t === 'quit')
        return { op: 'quit' };
    if (/^\d+$/.test(t))
        return { op: 'open', n: parseInt(t, 10) };
    const m = /^d\s+(\d+)$/.exec(t);
    if (m)
        return { op: 'delete', n: parseInt(m[1] ?? '', 10) };
    return { op: 'error', message: 'unknown command — a=add, <n>=open, d <n>=delete, q=close' };
}
function openExternal(url) {
    const child = process.platform === 'darwin'
        ? (0, node_child_process_1.spawn)('open', [url], { detached: true, stdio: 'ignore' })
        : process.platform === 'win32'
            ? (0, node_child_process_1.spawn)('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' })
            : (0, node_child_process_1.spawn)('xdg-open', [url], { detached: true, stdio: 'ignore' });
    child.unref();
}
function isTTY(stdin) {
    return !!stdin && stdin.isTTY === true && typeof stdin.setRawMode === 'function';
}
// ---------------------------------------------------------------------------
// Popup frame rendering
// ---------------------------------------------------------------------------
const LINE_FOOTER = 'a — add · <n> — open · d <n> — delete · q — close';
function digitsHint(n) {
    if (n <= 1)
        return '1';
    return `1..${n}`;
}
// The footer only advertises keys that can actually act on the current list —
// no more "1..9 open" when three links exist.
function keyFooter(armed, visibleCount) {
    if (visibleCount === 0)
        return 'a add · q close';
    if (armed)
        return `delete which? ${digitsHint(visibleCount)} · enter = selected · esc cancels`;
    const parts = [];
    if (visibleCount > 1)
        parts.push('↑/↓ select');
    parts.push('enter open');
    if (visibleCount > 1)
        parts.push(`${digitsHint(visibleCount)} open`);
    parts.push('a add', 'd delete', 'q close');
    return parts.join(' · ');
}
function panelFrame(workspaceId, label, links, error, opts = {}) {
    const { armed = false, keyMode = false, status = null, cursor = 0, windowStart = 0, } = opts;
    const rows = [];
    rows.push('\x1b[2J\x1b[H');
    rows.push(`Space links — ${label} \x1b[2m(${workspaceId})\x1b[22m`);
    rows.push('');
    const visible = links.slice(windowStart, windowStart + WINDOW);
    const visibleCount = Math.min(links.length, WINDOW);
    if (links.length === 0) {
        rows.push('  (none yet)');
    }
    else {
        if (windowStart > 0)
            rows.push(`  \x1b[2m↑ ${windowStart} above\x1b[22m`);
        visible.forEach((link, i) => {
            const digit = String(i + 1);
            const marker = windowStart + i === cursor ? '›' : ' ';
            const shown = armed ? `\x1b[7m${digit}\x1b[27m` : digit;
            const text = `${shown}. ↳ ${link.title}`;
            rows.push(`${marker} \x1b]8;;${link.url}\x1b\\${text}\x1b]8;;\x1b\\`);
        });
        const below = links.length - (windowStart + visible.length);
        if (below > 0)
            rows.push(`  \x1b[2m↓ ${below} below\x1b[22m`);
    }
    rows.push('');
    rows.push(keyMode ? keyFooter(armed, visibleCount) : LINE_FOOTER);
    if (status)
        rows.push(`✓ ${status}`);
    if (error)
        rows.push(`✗ ${error}`);
    rows.push('');
    return rows.join('\n');
}
// ---------------------------------------------------------------------------
// Panel target, context, and drivers
// ---------------------------------------------------------------------------
function resolveTarget(dir, env) {
    try {
        const parsed = JSON.parse(fs.readFileSync(path.join(dir, 'pending.json'), 'utf8'));
        if (isPendingTarget(parsed)) {
            return {
                workspaceId: parsed.workspaceId,
                label: pendingLabel(parsed),
                mode: parsed.mode === 'add' ? 'add' : 'open',
            };
        }
    }
    catch { /* fall through */ }
    try {
        const context = JSON.parse(env['HERDR_PLUGIN_CONTEXT_JSON'] || '{}');
        if (isPluginContext(context) && typeof context.workspace_id === 'string') {
            return {
                workspaceId: context.workspace_id,
                label: typeof context.workspace_label === 'string' ? context.workspace_label : context.workspace_id,
                mode: 'open',
            };
        }
    }
    catch { /* fall through */ }
    throw new Error('cannot resolve current space');
}
function pendingLabel(pending) {
    return typeof pending.label === 'string' && pending.label ? pending.label : pending.workspaceId;
}
function createPanelCtx({ dir, state, workspaceId, label, output, run, openExternal: openUrl = openExternal, }) {
    const ctx = {
        dir, state, workspaceId, label, output,
        error: null, status: null, armed: false,
        keyMode: false, cursor: 0, windowStart: 0,
        links: () => linksFor(state, workspaceId),
        render: () => {
            output.write(panelFrame(workspaceId, label, ctx.links(), ctx.error, {
                armed: ctx.armed,
                keyMode: ctx.keyMode,
                status: ctx.status,
                cursor: ctx.cursor,
                windowStart: ctx.windowStart,
            }));
        },
        // State hits disk first, then (in key mode) the frame re-renders *before*
        // the synchronous herdr CLI call, so the list updates instantly even when
        // the report is slow. A report failure surfaces on the next frame.
        persistAndReport: (links) => {
            state[workspaceId] = { label, links };
            writeState(dir, state);
            if (ctx.keyMode)
                ctx.render();
            try {
                reportTokens(workspaceId, links, run);
                ctx.error = null;
            }
            catch (err) {
                ctx.error = errorMessage(err);
            }
        },
        open: (n) => {
            const links = ctx.links();
            if (!Number.isInteger(n) || n < 1 || n > links.length) {
                ctx.error = `no link ${n}`;
                return false;
            }
            const link = links[n - 1];
            if (!link) {
                ctx.error = `no link ${n}`;
                return false;
            }
            openUrl(link.url);
            return true;
        },
        remove: (n) => {
            const links = ctx.links();
            const result = removeLink(links, n);
            if (!result.ok) {
                ctx.error = result.message;
                return false;
            }
            const removed = links[n - 1];
            if (!removed)
                return false; // unreachable: removeLink bounds-checked n
            ctx.persistAndReport(result.links);
            const view = clampView(Math.min(n - 1, result.links.length - 1), ctx.windowStart, result.links.length);
            ctx.cursor = view.cursor;
            ctx.windowStart = view.windowStart;
            ctx.status = `deleted — ↳ ${removed.title}`;
            return true;
        },
    };
    return ctx;
}
// URL-first capture matches the documented happy path: paste the URL, press
// Enter, then Enter again to keep the derived title (or type over it).
async function addFlow(ctx, askOrQuit) {
    const first = await askOrQuit('URL: ');
    if (first.eof)
        return 'eof';
    let urlLine = String(first.answer).trim();
    let url = '';
    for (;;) {
        if (urlLine === '')
            return 'cancelled';
        const probe = addLink(ctx.links(), '', urlLine);
        if (!probe.ok) {
            ctx.output.write(`✗ ${probe.message}\n`);
            const retry = await askOrQuit('URL: ');
            if (retry.eof)
                return 'eof';
            urlLine = String(retry.answer).trim();
            continue;
        }
        const added = probe.links[probe.links.length - 1];
        if (!added)
            return 'failed';
        url = added.url;
        break;
    }
    const suggested = deriveTitle(url);
    const t = await askOrQuit(`Title [${suggested}]: `);
    if (t.eof)
        return 'eof';
    const title = String(t.answer).trim() || suggested;
    const result = addLink(ctx.links(), title, url);
    if (!result.ok) {
        ctx.output.write(`✗ ${result.message}\n`);
        return 'failed';
    }
    ctx.persistAndReport(result.links);
    const view = clampView(result.links.length - 1, ctx.windowStart, result.links.length);
    ctx.cursor = view.cursor;
    ctx.windowStart = view.windowStart;
    ctx.status = `added — ↳ ${title}`;
    return 'added';
}
function promptLine(input, output, prompt) {
    return new Promise((resolve) => {
        let settled = false;
        const rl = readline.createInterface({
            input,
            // readline only calls output.write(...) at runtime; PanelOutput is the
            // minimal structural contract that keeps outputs test-injectable.
            output: output,
        });
        rl.on('close', () => { if (!settled)
            resolve({ eof: true, answer: '' }); });
        rl.question(prompt, (a) => {
            settled = true;
            resolve({ eof: false, answer: a });
            rl.close();
            // readline pauses its input on close; resume so raw-mode keypresses keep
            // flowing when the popup returns from a prompt to the menu loop.
            input.resume();
        });
    });
}
async function lineDriver(ctx, { input, output }, mode) {
    const rl = readline.createInterface({
        input,
        output: output,
        terminal: false,
    });
    const pendingLines = [];
    let lineWaiter = null;
    rl.on('line', (l) => {
        if (lineWaiter) {
            const w = lineWaiter;
            lineWaiter = null;
            w(l);
        }
        else {
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
        const buffered = pendingLines.shift();
        if (buffered !== undefined) {
            resolve(buffered);
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
        if (menu.eof)
            return;
        ctx.status = null;
        ctx.error = null;
        const cmd = parseCommand(menu.answer);
        if (cmd.op === 'quit') {
            rl.close();
            return;
        }
        if (cmd.op === 'redraw')
            continue;
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
        if (promptActive)
            return;
        const fallback = {};
        if (typeof str === 'string')
            fallback.name = str;
        pendingKeys.push(key ?? fallback);
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
            w();
        }
    });
    const cooked = () => { try {
        input.setRawMode(false);
    }
    catch { /* already gone */ } };
    const rearmRaw = () => { try {
        input.setRawMode(true);
    }
    catch { /* already gone */ } };
    const nextKey = () => new Promise((resolve) => {
        const drain = () => {
            const buffered = pendingKeys.shift();
            if (buffered !== undefined) {
                resolve(buffered);
                return;
            }
            if (closed) {
                resolve(null);
                return;
            }
            keyWaiter = drain;
        };
        drain();
    });
    const askOrQuit = (prompt) => {
        promptActive = true;
        return promptLine(input, output, prompt).finally(() => {
            promptActive = false;
            rearmRaw();
            input.resume();
        });
    };
    input.setRawMode(true);
    if (mode === 'add' || ctx.links().length === 0) {
        await addFlow(ctx, askOrQuit);
        if (closed) {
            cooked();
            return;
        }
    }
    for (;;) {
        ctx.render();
        const key = await nextKey();
        if (key === null) {
            cooked();
            return;
        }
        const act = menuKey(ctx.armed, key);
        // Status and error lines are transient: they describe the *previous*
        // action and disappear on the next keypress. This also fixes the stale
        // error bug where one bad key left a red message on every later frame.
        ctx.status = null;
        ctx.error = null;
        if (act.op === 'arm')
            ctx.armed = true;
        else if (act.op !== 'move')
            ctx.armed = false;
        if (act.op === 'quit') {
            cooked();
            return;
        }
        if (act.op === 'add') {
            await addFlow(ctx, askOrQuit);
            if (closed) {
                cooked();
                return;
            }
            continue;
        }
        if (act.op === 'move') {
            const view = clampView(ctx.cursor + act.delta, ctx.windowStart, ctx.links().length);
            ctx.cursor = view.cursor;
            ctx.windowStart = view.windowStart;
            continue;
        }
        if (act.op === 'open') {
            if (ctx.open(ctx.windowStart + act.n)) {
                cooked();
                return;
            }
            continue;
        }
        if (act.op === 'open-selected') {
            if (ctx.links().length === 0) {
                ctx.error = 'no links yet — press a to add';
                continue;
            }
            if (ctx.open(ctx.cursor + 1)) {
                cooked();
                return;
            }
            continue;
        }
        if (act.op === 'delete') {
            ctx.remove(ctx.windowStart + act.n);
            continue;
        }
        if (act.op === 'delete-selected') {
            ctx.remove(ctx.cursor + 1);
            continue;
        }
        // noop: fall through, next render shows a clean frame
    }
}
async function panelMain(opts = {}) {
    const env = opts.env ?? process.env;
    const input = opts.stdin ?? process.stdin;
    const output = opts.stdout ?? process.stdout;
    const dir = env['HERDR_PLUGIN_STATE_DIR'];
    if (!dir)
        throw new Error('HERDR_PLUGIN_STATE_DIR is not set');
    const { workspaceId, label, mode } = resolveTarget(dir, env);
    let state;
    try {
        state = readState(dir);
    }
    catch {
        output.write('links.json is corrupt — fix or remove it\n');
        process.exit(1);
    }
    const ctx = createPanelCtx({
        dir, state, workspaceId, label, output, run: herdrRun, openExternal: opts.openExternal,
    });
    if (isTTY(input))
        return keyDriver(ctx, { input, output }, mode);
    return lineDriver(ctx, { input, output }, mode);
}
function refreshFocused(env, dir, run) {
    let ev = null;
    try {
        ev = JSON.parse(env['HERDR_PLUGIN_EVENT_JSON'] || '{}');
    }
    catch {
        ev = null;
    }
    let wsId = null;
    if (isFocusedEvent(ev)) {
        wsId = ev.workspace_id
            ?? (ev.workspace !== undefined && typeof ev.workspace.workspace_id === 'string'
                ? ev.workspace.workspace_id
                : null);
    }
    wsId = wsId ?? env['HERDR_WORKSPACE_ID'] ?? null;
    if (!wsId)
        return { ok: true, skipped: 'no workspace id' };
    const state = readState(dir);
    if (!state[wsId])
        return { ok: true, skipped: 'no links stored' };
    reportTokens(wsId, linksFor(state, wsId), run);
    return { ok: true };
}
// ---------------------------------------------------------------------------
// CLI dispatch (herdr invokes: node spacelinks.js <command>)
// ---------------------------------------------------------------------------
if (require.main === module) {
    const cmd = process.argv[2];
    const openFromContext = (mode) => {
        let workspaceId;
        let label;
        try {
            const context = JSON.parse(process.env['HERDR_PLUGIN_CONTEXT_JSON'] || '{}');
            if (isPluginContext(context)) {
                workspaceId = context.workspace_id;
                label = context.workspace_label;
            }
        }
        catch {
            workspaceId = undefined;
        }
        if (!workspaceId)
            throw new Error('cannot resolve current space from context');
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
        }
        if (cmd === 'add') {
            openFromContext('add');
        }
        if (cmd === 'refresh') {
            refreshFocused(process.env, stateDir(), herdrRun);
            process.exit(0);
        }
        if (cmd === 'panel') {
            panelMain({ env: process.env })
                .then(() => process.exit(0))
                .catch((err) => {
                console.error(`spacelinks: ${errorMessage(err)}`);
                process.exit(1);
            });
        }
        else {
            console.error(`spacelinks: unknown subcommand ${JSON.stringify(cmd)}`);
            process.exit(1);
        }
    }
    catch (err) {
        console.error(`spacelinks: ${errorMessage(err)}`);
        process.exit(1);
    }
}
