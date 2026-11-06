<img src="assets/icon.svg" width="64" height="64" alt="">

# herdr-spacelinks

A [herdr](https://herdr.dev) plugin that gives every Space in the sidebar its own
web links. Press one shortcut, add a URL and a title in a popup, and the link
appears indented under that Space in the sidebar — one keypress away in your
default browser.

```
● web-dashboard
  feat/usage-charts ↑1
  ↳ GitHub repo
  ↳ Figma board
● data-pipeline
  backfill/events-v2
```

## Requirements

- herdr ≥ 0.9.3
- Bun (`bun` on `PATH`) — herdr runs the TypeScript source, `spacelinks.ts`,
  directly with it; there is no compiled artifact

## Install

### From GitHub (any machine)

```bash
herdr plugin install giacomorebonato/herdr-spacelinks
```

(This repo is private; the machine needs access — an SSH key or `gh auth`
for the `giacomorebonato` account.) Update later with `herdr plugin update
spacelinks`.

### From a local checkout

```bash
herdr plugin link /path/to/herdr-spacelinks
```

Then add these blocks to your herdr `config.toml` (default
`~/.config/herdr/config.toml`) and reload.

Two keybindings — one to open the links popup for the focused Space, one that
opens it already in the add form:

```toml
[[keys.command]]
key = "prefix+m"
type = "plugin_action"
command = "spacelinks.open"
description = "space links"

[[keys.command]]
key = "prefix+alt+a"
type = "plugin_action"
command = "spacelinks.add"
description = "add space link"
```

The `prefix+alt+…` family is free in herdr's default keymap — the more
obvious `prefix+1..9` belongs to `switch_tab`, so the alt layer is where
plugin keys fit without remapping herdr. Pick any free key you like instead;
only avoid `prefix+l` (navigate pane right).

### Prefix-less keys

Keys without the prefix work too: herdr treats a key like `ctrl+alt+o` as a
direct terminal-mode shortcut that fires without entering prefix mode, from
any pane, even while an app owns the keyboard. herdr's default keymap claims
no direct chords besides `ctrl+v` (remote image paste, active only in
`--remote` sessions), and herdr's config guide names explicit modified
chords and function keys as the most reliable direct bindings.

Suggested pair — `o` for open, `i` for insert. With `ctrl+alt` held on the
left (pinky + thumb), the letter should come from the right hand: `i` and
`o` sit a row up from home under the middle and ring fingers, so the chord
is two easy presses. (`a` forces the same left pinky that holds ctrl to tap
the key, and `m` is a bottom-row reach — both awkward in a chord.)

```toml
[[keys.command]]
key = "ctrl+alt+o"
type = "plugin_action"
command = "spacelinks.open"
description = "space links"

[[keys.command]]
key = "ctrl+alt+i"
type = "plugin_action"
command = "spacelinks.add"
description = "add space link"
```

Strict home-row alternates: `ctrl+alt+j` / `ctrl+alt+k` for open/add (the
strongest fingers, with the small cost of reading as vim movement), or a
spare function key like `f8` (keep clear of `f1`/`f11`, which terminals
claim for help and fullscreen). Because a direct chord fires on every
keypress in every pane, stay on `ctrl+alt+letter` — nearly untouched
territory for tty apps — and don't bind bare keys such as `o` or `i` (they'd
vanish from normal typing) or `ctrl+v`, which herdr and most terminals
reserve for paste.

Both actions are also in the workspace right-click menu, and on the command
line:

```bash
herdr plugin action invoke spacelinks.add
```

Sidebar rows (two default rows plus one token row per link; links render as
dimmed `↳` rows under the Space, at most 9 per Space):

```toml
[ui.sidebar.spaces]
rows = [
  ["state_icon", "workspace"],
  ["branch", "git_status"],
  [{ token = "$spacelink_1", dim = true }],
  [{ token = "$spacelink_2", dim = true }],
  [{ token = "$spacelink_3", dim = true }],
  [{ token = "$spacelink_4", dim = true }],
  [{ token = "$spacelink_5", dim = true }],
  [{ token = "$spacelink_6", dim = true }],
  [{ token = "$spacelink_7", dim = true }],
  [{ token = "$spacelink_8", dim = true }],
  [{ token = "$spacelink_9", dim = true }],
]
```

Then:

```bash
herdr server reload-config
```

(If you kept a 14-row block from an older install, leave it — the plugin
always clears `spacelink_1..14`, so no ghost rows can survive. Nine is just
the new link limit.)

## Use

1. Focus the Space you want links for and press `prefix+m`. The popup lists
   that Space's links with a `›` cursor on the selected row; rows are
   numbered and Ctrl-clickable.
2. One keypress per action:

   | Key | Action |
   |---|---|
   | `↑`/`↓` (or `k`/`j`) | move the cursor |
   | `Enter` | open the selected link in the default browser (popup closes) |
   | `1`–`9` | quick-open that row of the visible window (popup closes) |
   | `a` | add — prompts `URL:` first, then `Title [<derived>]:` |
   | `d` | delete the row the `›` cursor is on (move with `↑`/`↓` first) |
   | `q` / `Esc` / `Ctrl+C` / `Ctrl+D` | close the popup |

   Deleting needs no confirmation: the `✓ deleted — ↳ …` status line names the
   row removed until your next keypress. The footer only
   advertises keys that can act (`1..3 open` when three links exist, no
   digits at all with one link), and stray keypresses are ignored silently
   instead of printing an error. Add/delete confirmations (`✓ added`,
   `✓ deleted`) show until the next keypress, then clear.

3. `prefix+alt+a` skips the list and jumps straight into the add form —
   capture is press binding, paste URL, Enter, Enter (the title prompt comes
   pre-filled with the URL-derived title; typing over it customizes). A
   Space with no links also opens straight into the add form; cancelling it
   (empty URL) lands on the list.
4. Ctrl-click a link title in the popup also opens it (herdr opens pane URLs
   in the default browser when `ui.mouse_capture` is on, the default).
5. Schemeless input gets `https://` prepended; at most 9 links per Space
   (the sidebar token rows and the add cap both stop at 9). The popup lists
   9 rows per window with `↑ N above` / `↓ N below` hints, so links stored
   by older versions beyond the 9-row sidebar cap remain visible, openable,
   and deletable by scrolling.

If the popup's input is not a terminal (piped), commands fall back to
line mode: type `a`, a number, `d <n>`, or `q` and press Enter. Line mode
addresses links by absolute position, so `d 12` still manages legacy link 12.

## Where the links live, and when they come back

Links are stored per Space in the plugin state dir and re-applied when herdr
restarts (a startup hook), so they survive restarts and updates. The
`↳` rows also republish whenever you focus a Space with stored links (a
`workspace.focused` event hook) — so after `herdr server reload-config` or
re-enabling the plugin, the rows come back on the next visit to the Space.

Debug with `herdr plugin log list --plugin spacelinks`. State lives in the
plugin state dir printed by `herdr plugin config-dir spacelinks`.

## Development

The source of truth is `spacelinks.ts` (strict TypeScript: discriminated menu
actions, typed CLI/stream boundaries, and runtime guards for every JSON input
— state files are hand-editable, so `links.json` is validated before use).
herdr runs it directly with Bun — no build step, no compiled artifact.

**Bun is the package manager and script runner** (`bun.lock` is the lockfile;
never add a `package-lock.json`). The test suite runs on `bun test`, because
it exercises the `spacelinks.ts` source against the same runtime herdr uses.

```bash
bun install        # dev-only toolchain: @types/node
bun run typecheck  # bun check — Bun's built-in typechecker (strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes)
bun run test       # bun test test/spacelinks.test.js — requires spacelinks.ts directly
```

After editing `spacelinks.ts`, run `bun run typecheck` and `bun run test`.

## Notes

- Links appear only in the **expanded** sidebar; the collapsed sidebar shows
  space names only.
- Sidebar rows are plain text (herdr renders them); clicking happens in the
  popup, not in the sidebar.

## Uninstall

```bash
herdr plugin unlink spacelinks
```

and remove the `config.toml` blocks above.

---

Created in [T3 Code](https://t3.codes).
