# Cursor purity — no row numbers in key mode (2026-11-06)

## Intent and why

Follow-on to the direct-delete change: with a cursor (`›`) as the only way to
name a link, digits (`1..N open`) and their footer hint are remaining noise
from the pre-cursor design. A user "should never press a number to identify
which URL is meant — it's implied by the selection" (user). Retiring digits
leaves one mental model: the cursor points at the thing; every verb acts on it
(enter opens, `d` deletes).

## Approach (picked by user: Option 1)

Full cursor purity: drop digit keys, the `1..N open` footer hint, and the
`N. ↳` row-number prefixes. Rejected alternative (option 2 — keep visible row
numbers): keeps noise on screen for no remaining function (scroll hints
`↑/↓ N above/below` already carry position; sidebar tokens are unnumbered).

## Design

- `menuKey`: digits are no longer keys — unknown-key silent noop. The
  `{ op: 'open'; n }` op leaves `MenuAction` (Enter/open-selected remains);
  `keyDriver` drops it — digits and other stray keys are silent no-ops.
- `keyFooter(visibleCount)`: no digit hint — multi-link: `↑/↓ select ·
  enter open · a add · d delete · q close` (1-link and empty variants as
  today). `digitsHint` helper is removed with it.
- `panelFrame`: rows render `↳ title` (no `N.` prefix); the `↑ N above` /
  `↓ N below` scroll hints stay.
- Line mode unchanged in behavior and copy: `a`, `<n>`, `d <n>`, `q` keeps
  absolute-position addressing (no cursor exists there; it's the piped
  fallback). Its footer `LINE_FOOTER` is untouched. Without on-screen row
  labels, piped scripts address by list position — same as >9 already did.
- Add/scroll/quit flows untouched.

## Non-goals / anti-goals

- No cursor memory (remembering last selection across popup opens) — offered,
  not requested.
- No changes to line mode, mouse Ctrl-click, or the herdr sidebar tokens.

## Tests

- Unit: digit keys map to noop; footer strings without the hint; frame rows
  without `N.` prefixes (scroll hints still match).
- Integration: a digit key with links openable does nothing visible (no open,
  no error, state unchanged); the d-deletes-selected-row path still works
  without any digit keys.
- Gate: `bun run typecheck` and `bun run test` green.
