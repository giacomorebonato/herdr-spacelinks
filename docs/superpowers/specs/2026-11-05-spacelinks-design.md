# Space Links — herdr plugin design

Date: 2026-11-05 · Status: approved (2026-11-05)

## Intent

Give every Space (workspace) in the herdr sidebar a small set of web links:
press one shortcut, a modal popup lists the focused Space's links and lets you
add a new one (title + URL); links then show up indented under the Space in the
sidebar. Opening a link opens it in the default browser.

Why: quick access to pages tied to the work in each Space — PR links,
dashboards, docs, anything connected with the current work — without leaving
the terminal, attached to the space they belong to.

## Goals

- One shortcut (`prefix+m`, user-configurable) opens one modal for the focused Space.
- Modal lists the Space's links, numbered and OSC 8 hyperlinked; **clicking a
  link (Ctrl-click) or typing its number opens it in the default browser**.
- Modal adds a link via a title + URL form; deleting links is supported.
- Links render indented under the Space in the expanded sidebar; spaces without
  links render exactly as today (empty token rows elide — verified in herdr
  source `src/ui/sidebar/tokens.rs`).
- Links survive herdr restarts (re-applied by a `[[startup]]` hook).

## Non-goals / anti-goals

- Clickable links *in the sidebar* — impossible in plugin v1 (tokens are plain
  text, control chars stripped; sidebar has no plugin click routing).
- Link handler intercepting Ctrl-clicks on arbitrary URLs (option C) — possible
  later, intentionally omitted.
- Editing/reordering links; orphan-state cleanup on workspace close; >14 links per Space (herdr caps sidebar rows at 16 total — the 2 default
  rows leave 14; 32 token keys per workspace).
- Marketplace publishing (can add GitHub topic `herdr-plugin` later).

## Constraints (verified against herdr 0.9.5 docs + source)

- Plugin = directory with `herdr-plugin.toml` + argv commands; full CLI is the
  API, called via `HERDR_BIN_PATH`. No native sidebar UI in v1.
- Keybinding → action: `[[keys.command]]` `type = "plugin_action"` in user
  `config.toml`. `prefix+l` is taken (pane-right); `prefix+m` is free.
- Modal: `[[panes]]` with `placement = "popup"` — session-modal, singleton,
  receives all input incl. Escape, closes when the command exits. The action
  opens it via `herdr plugin pane open --plugin <id> --entrypoint <id>`
  (manifest placement applies when CLI omits `--placement`).
- Sidebar: `herdr workspace report-metadata <ws> --source plugin:spacelinks
  --token name=value [--clear-token name]`; user config adds
  `ui.sidebar.spaces.rows` entries. Token values: trimmed, control chars
  removed, 80-char cap. Token names `[a-zA-Z0-9_-]{1,32}`. Max 16 token keys
  per report call; 32 keys retained per workspace.
- Token metadata does not survive a server restart → must be re-applied
  (startup hook; also re-runs on live handoff).
- Workspace IDs are stable public identities, persisted in `session.json` —
  safe as the state key.
- Ctrl-click on OSC 8 / https URLs inside panes opens the default browser
  (`ui.mouse_capture = true`, the default).

## Approach

**Chosen: A — one modal does everything.** One shortcut, one popup: links list
at top, command/add form below. One surface to learn; the add flow is the
primary use case and stays one keystroke away.

Rejected:
- **B — two shortcuts** (add modal + open picker): cleaner separation, but two
  bindings and two surfaces for one small feature.
- **C — link handler on arbitrary Ctrl-clicked URLs**: nice capture flow but
  intercepts normal link-opening globally; orthogonal, omitted from v1.

## Design

### Plugin layout (repo root = plugin dir)

```
herdr-plugin.toml
spacelinks.js        # single Node script, subcommand dispatch, no deps
README.md            # install + config.toml instructions
```

Node is the runtime call: JSON state without jq, cross-platform, zero build
step. The user's machines run Node (pi/T3 are Node-based).

### Manifest sketch

```toml
id = "spacelinks"
name = "Space Links"
version = "0.1.0"
min_herdr_version = "0.9.5"  # verified against this version's docs + source
description = "Per-Space web links in the herdr sidebar"
platforms = ["macos", "linux", "windows"]

[[actions]]
id = "open"
title = "Space links"
contexts = ["workspace"]
command = ["node", "spacelinks.js", "open"]

[[panes]]
id = "panel"
title = "Space links"
placement = "popup"
width = "70%"
height = 20
command = ["node", "spacelinks.js", "panel"]

[[startup]]
command = ["node", "spacelinks.js", "apply"]
```

### User config.toml additions (documented in README)

```toml
[[keys.command]]
key = "prefix+m"
type = "plugin_action"
command = "spacelinks.open"
description = "space links"

[[keys.command]]
# optional: user may prefer any free key
...

[ui.sidebar.spaces]
rows = [
  ["state_icon", "workspace"],
  ["branch", "git_status"],
  [{ token = "$spacelink_1", dim = true }],
  [{ token = "$spacelink_14", dim = true }],
  # rows 3..16 = $spacelink_1..$spacelink_14 (16-row cap: 2 default + 14 links)
]
```

### State

`HERDR_PLUGIN_STATE_DIR/links.json`, keyed by workspace ID (stable across
restarts):

```json
{
  "w1": { "label": "web-dashboard", "links": [ { "title": "GitHub repo", "url": "https://..." } ] }
}
```

14 links max per Space (16-row sidebar cap minus the 2 default rows);
the modal refuses beyond that with a message.
Label is stored for display/telemetry only.

### Modal UX (subcommand `panel`)

```
Space links — web-dashboard

  1. ↳ GitHub repo        ← OSC 8 hyperlink; Ctrl-click opens browser
  2. ↳ Figma board
  (none yet)

a — add    <n> — open    d <n> — delete    q/esc — close
> _
```

- On open with no links: jump straight into the add form (Title:, URL:).
- Add: prompt title, prompt URL (validate `^https?://`), save, refresh tokens,
  redraw. An **empty title auto-derives from the URL** (protocol and trailing
  slash stripped, truncated to fit 80 chars) so quick capture is paste-url →
  enter → enter.
- Open: run `open` (macOS) / `xdg-open` (Linux) / `start` (Windows) on the
  chosen URL, then exit (popup closes). Ctrl-click on the hyperlinked title
  opens in browser directly via herdr.
- Delete: remove, refresh tokens, redraw.
- Target Space: read from the action-provided context (the action writes
  `pending.json` in the state dir with the invoking workspace id before
  opening the popup; panel reads it, falls back to `HERDR_PLUGIN_CONTEXT_JSON`
  / focused workspace via `herdr api snapshot`).

### Sidebar rendering (subcommand `apply`, shared with add/delete)

For each workspace with links: report tokens `spacelink_1..N` (N ≤ 14) =
`"↳ <title>"` (title truncated so the value stays ≤80 chars; glyph carries the
indent since values are trimmed) and clear `spacelink_N+1..14`. When a report
call would exceed 16 keys (sets + clears count), use a second call for the
remaining clears. `apply` (startup)
iterates `herdr workspace list` and re-applies stored links.

### Install (dev)

`herdr plugin link <repo>` + paste the two config blocks + `herdr server
reload-config`.

## Left to the builder (my calls, correctable)

- Glyph `↳`, popup size 70% × 20 rows, prompt wording, `prefix+m` default key.
- Exact modal key handling (raw-mode Escape vs `q`+Enter fallback).
- Unit tests (node:test) for pure logic: state round-trip, token
  build/truncate, URL validation. TUI interaction verified manually.
