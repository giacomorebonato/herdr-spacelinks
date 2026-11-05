# Space Links — intuitive shortcuts (design addendum)

Date: 2026-11-05 · Status: approved by user ("dive with your pick, I trust your
recommendation" — approving the approaches message of the same date)
Amends: `2026-11-05-spacelinks-design.md`

## Intent

Take the shortcut feel of `bonkey/herdr-bookmark` into spacelinks: one
keystroke per action inside the modal, one action reachable without the modal,
and tokens that survive `server reload-config` / plugin enable. Why: the user
finds bookmark's shortcuts more intuitive — direct keystrokes, no Enter tax,
instant sidebar feedback.

## Goals

1. **Single-key modal.** On a TTY stdin the popup reacts to single keypresses:
   `1..9` open link *n*, `a` opens the add form, `d` arms delete → next digit
   deletes, `q`/Esc/Ctrl+C closes. On open with no links (or via the `add`
   action) the modal jumps straight into the add form — this was in the
   original design but never implemented.
2. **Direct add action.** New manifest action `spacelinks.add`
   (`contexts = ["workspace"]`): popup pre-armed in the add form; documented
   binding `prefix+alt+a`; appears in the workspace right-click menu and via
   `herdr plugin action invoke spacelinks.add`.
3. **Focus republish.** `[[events]] on = "workspace.focused"` hook republishes
   stored links from disk, closing the gap where `reload-config` / plugin
   enable / focus-time token loss leaves the sidebar empty until the next
   mutation.

## Non-goals

- Direct "open link N" bindings — bookmark's marks are fixed slots; our list
  reorders as links change, so positional bindings would be a trap.
- Clear-all action — destructive without review.
- Reordering/sorting links; keying state by checkout folder (workspace ids are
  verified stable).

## Constraints (verified against herdr 0.9.5 docs)

- Popup panes "receive all terminal input, including Escape" on a pty → raw
  single-key stdin is available. Non-TTY stdin (pipes, tests) must degrade to
  the current line-based REPL.
- `workspace.focused` is a documented event; hooks receive
  `HERDR_PLUGIN_EVENT_JSON`; event names are validated at link time.
- `prefix+alt+…` is free by default (`focus_agent`'s `prefix+alt+1..9` example
  is unset); `prefix+1..9` is `switch_tab`.
- Report call caps: 16 token keys per call. Sets + clears must fit.

## Approach (as approved)

Chosen: all three, ordered 1) single-key modal, 2) add action, 3) focus hook.
Rejected: direct open-N bindings (positional trap); clear-all (destructive);
`pane.focused` hook (bookmark needs pane events because it publishes on panes
for Agent rows; our tokens are workspace metadata — the rarer
`workspace.focused` is enough).

## My calls (correctable)

- **MAX_LINKS 14 → 9.** Every link addressable by one digit. Token *clears*
  still cover `spacelink_1..14` so configs keeping the old 14-row block never
  ghost a row. Stored entries beyond 9 are kept in `links.json`, shown capped
  at 9 with a warning line; `addLink` refuses beyond 9 counting full length.
- Auto-jump into the add form happens on **open-with-no-links (key mode)** and
  **`add` action (both modes)**, once per open; cancelling the form lands on
  the menu (no re-jump trap). Line mode without the `add` flag keeps the
  explicit `a` command (piped smoke tests unchanged).
- Delete arming: `d` then digit deletes; Esc or any non-digit disarms.
- Unknown key: error line mirroring the footer (`unknown key — 1..9 open · a
  add · d delete · q/esc close`).
- Focus hook exits silently when the workspace has no stored entry (no herdr
  call), and is defensive about the event JSON shape (tries
  `workspace_id`, `workspace.workspace_id`, then `HERDR_WORKSPACE_ID`).
- Footer copy: `1..9 open · a add · d delete · q/esc close`; armed state swaps
  it to `delete which? 1..9 · esc cancels`.

## Left to the builder

- Keypress layer (`readline.emitKeypressEvents` + raw mode vs raw bytes) and
  the readline/raw-mode handoff between menu and prompt phases.
- Live payload check of `HERDR_PLUGIN_EVENT_JSON` for `workspace.focused`
  during verification; adjust field paths if needed.
