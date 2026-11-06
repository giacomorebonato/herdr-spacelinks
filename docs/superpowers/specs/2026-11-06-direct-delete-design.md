# Direct delete — `d` deletes the selected row (2026-11-06)

## Intent and why

The key-mode delete flow (`d` arms → next digit or Enter deletes) was designed
in the 2026-11-05 shortcuts spec, when digits were the only way to address a
row and the popup had no cursor. The 2026-11-06 cursor update made `↑/↓` + the
`›` marker the primary interaction but kept the arming dance, and its footer
copy (`delete which? 1..3 · enter = selected · esc cancels`) reads as a number
prompt. With a visible selection, the target is obvious; `d` should act on it.

## Approach (picked with the user: A)

`d` deletes the `›`-selected row immediately in key mode; delete-arming goes
away entirely. Rejected alternative (B — keep arming, reword the footer):
still two keypresses for the common case, and still reads number-first.

## Design

- `menuKey` becomes single-state: `d` → `delete-selected`; digits → open that
  row of the visible window (unchanged); Enter → open-selected (unchanged);
  up/down/k/j → move; `a` → add; q/esc/Ctrl+C/Ctrl+D → quit; unknown → noop.
- `MenuAction` drops the `arm`, `delete`, and `disarm` key-mode ops;
  `delete-selected` (cursor row) becomes the only delete action.
- `PanelCtx.armed`, `PanelFrameOptions.armed`, and the inverse-digit armed
  highlighting in `panelFrame` are removed.
- Footer: the armed branch is removed. The existing disarmed copy is already
  accurate for the new semantics and stays — `↑/↓ select · enter open ·
  1..3 open · a add · d delete · q close` (and the 1-link / empty variants
  unchanged).
- Esc now always quits (it previously only disarmed); while armed it wasn't a
  quit key, and arming is gone.
- With no links, `d` shows `✗ no links yet — press a to add` (same message the
  empty-list Enter path already uses).
- After a delete the existing view clamp is reused unchanged: the cursor lands
  on the next row and the 9-row window re-clamps.
- Line mode is untouched: `d <n>` (absolute addressing, still needed for legacy
  >9-link states), `parseCommand`, and the `LINE_FOOTER` copy stay as is.

## Non-goals / anti-goals

- No undo and no confirmation step — the accepted tradeoff: the status line
  names exactly what was deleted and re-adding a link is cheap.
- No changes to add/open flows, digit open semantics, or line mode.
- No new keys; deleting a row you didn't move to is navigate-then-`d`.

## Tests

- `menuKey` tests: no arm/disarm/armed-digit cases; `d` → `delete-selected` in
  a single state.
- Footer/frame tests: armed branch and inverse-digit assertions removed.
- Key-mode integration test: one `d` keypress deletes the cursor row (frame
  count shrinks, status names the deleted link), no second key needed.
- Gate: `bun run typecheck` and `bun run test` green.
