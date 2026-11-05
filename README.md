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

## Install (local checkout)

```bash
herdr plugin link /path/to/herdr-spacelinks
```

Then add two blocks to your herdr `config.toml` (default
`~/.config/herdr/config.toml`) and reload:

```toml
[[keys.command]]
key = "prefix+m"
type = "plugin_action"
command = "spacelinks.open"
description = "space links"
```

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
  [{ token = "$spacelink_10", dim = true }],
  [{ token = "$spacelink_11", dim = true }],
  [{ token = "$spacelink_12", dim = true }],
  [{ token = "$spacelink_13", dim = true }],
  [{ token = "$spacelink_14", dim = true }],
]
```

Pick any free key instead of `prefix+m` — only avoid `prefix+l`
(navigate pane right). Then:

```bash
herdr server reload-config
```

## Use

1. Focus the Space you want links for and press `prefix+m`.
2. The modal lists that Space's links. Commands:
   - `a` — add: prompt `Title (Enter = derive from URL):` then `URL:`
     (Enter on empty URL cancels; schemeless input gets `https://` prepended)
   - `<n>` — open link *n* in the default browser
   - `d <n>` — delete link *n*
   - `q` — close
3. Ctrl-click a link title in the modal also opens it (herdr opens pane URLs in
   the default browser when `ui.mouse_capture` is on, the default).
4. Links render as dimmed `↳` rows under the Space, up to 14 per Space, in the
   expanded sidebar.

Links are stored per Space in the plugin state dir and re-applied when herdr
restarts, so they survive restarts and updates.

## Notes

- Links appear only in the **expanded** sidebar; the collapsed sidebar shows
  space names only.
- Sidebar rows are plain text (herdr renders them); clicking happens in the
  modal, not in the sidebar.
- State lives in the plugin state dir printed by
  `herdr plugin config-dir spacelinks`.

## Uninstall

```bash
herdr plugin unlink spacelinks
```

and remove the two `config.toml` blocks above.

---

Created in [T3 Code](https://t3.codes).
