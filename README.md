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
- Node.js ≥ 18 (`node` on `PATH`)

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
only avoid `prefix+l` (navigate pane right). Both actions are also in the
workspace right-click menu, and on the command line:

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
   that Space's links, numbered and Ctrl-clickable.
2. One keypress per action, no Enter needed:

   | Key | Action |
   |---|---|
   | `1`–`9` | open that link in the default browser (popup closes) |
   | `a` | add — prompts `Title (Enter = derive from URL):` then `URL:` |
   | `d` then a digit | delete that link (any other key cancels) |
   | `q` / `Esc` / `Ctrl+C` / `Ctrl+D` | close the popup |

3. `prefix+alt+a` skips the list and jumps straight into the add form —
   capture is press binding, paste URL, Enter. A Space with no links also
   opens straight into the add form; cancelling it (empty URL) lands on the
   list.
4. Ctrl-click a link title in the popup also opens it (herdr opens pane URLs
   in the default browser when `ui.mouse_capture` is on, the default).
5. Empty title derives from the URL; schemeless input gets `https://`
   prepended; at most 9 links per Space (the number keys only reach 9).

If the popup's input is not a terminal (piped), commands fall back to
line mode: type `a`, a number, `d <n>`, or `q` and press Enter.

## Where the links live, and when they come back

Links are stored per Space in the plugin state dir and re-applied when herdr
restarts (a startup hook), so they survive restarts and updates. The
`↳` rows also republish whenever you focus a Space with stored links (a
`workspace.focused` event hook) — so after `herdr server reload-config` or
re-enabling the plugin, the rows come back on the next visit to the Space.

Debug with `herdr plugin log list --plugin spacelinks`. State lives in the
plugin state dir printed by `herdr plugin config-dir spacelinks`.

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
