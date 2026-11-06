# Space Links — TUI smoothing pass

Date: 2026-11-06 · Status: implemented
Amends: `2026-11-05-spacelinks-design.md`, `2026-11-05-spacelinks-shortcuts-design.md`

## Intent

Make the popup feel smooth instead of merely functional: feedback that
matches each action, a footer that only promises keys that can act, a
capture flow that matches the documented happy path (paste URL, Enter),
and no dead ends for links stored before the 9-link cap.

## Changes

1. **Transient status/error lines.** `✗` errors and `✓ added/deleted`
   confirmations show for exactly one keypress, then clear. Fixes the
   verified bug where one bad key left a red error on every later frame
   (the old code only reset `ctx.error` on a successful report).
2. **Silent unknown keys.** Stray keypresses are ignored instead of
   printing an error; the footer already documents the contract.
3. **Honest footer.** `1..3 open` when three links exist; no digit hint
   with one link (Enter covers it); `a add · q close` when empty.
4. **Cursor model.** `↑/↓` (and `k/j`) move a `›` cursor, Enter opens the
   selected link, digits stay as window-relative accelerators. `d` then a
   digit or Enter deletes; armed mode highlights the row digits.
5. **Scrolling.** The popup shows a 9-row window with `↑ N above` /
   `↓ N below` hints, so legacy links beyond the sidebar cap (stored before
   MAX_LINKS dropped 14 → 9) are visible, openable, and deletable again.
6. **URL-first add.** `URL:` first, then `Title [<derived>]:` — one paste
   plus Enter/Enter matches the README capture story; typing over the
   suggestion customizes it.
7. **Instant feedback before the report.** `persistAndReport` writes state,
   re-renders (key mode), then runs the synchronous `herdr report-metadata`
   call — the list updates even when the CLI is slow. A prompt-readline
   resume fix keeps keypresses flowing after the add form closes.

Line mode keeps its `a` / `<n>` / `d <n>` / `q` commands and absolute
indexing (`d 12` still manages legacy link 12).

## Deliberately not done

- **Bun `--compile` binary.** The plugin is spawn-per-action and I/O-bound;
   nearly all latency is Node startup (~tens of ms) and the `herdr` child
   process itself, which a compiled binary does not change. It would also
   add a build step and per-platform artifacts to a plugin installed from
   GitHub on macOS/Linux/Windows.
- Editing/reordering links, sidebar clickability — unchanged non-goals.

## Addendum (same day): TypeScript migration

Per user request, the JSDoc pass was upgraded to real TypeScript:
`spacelinks.ts` is the strongly-typed source (strict mode,
`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`; discriminated
unions for menu actions and line commands; typed herdr CLI, stream, and
panel-context boundaries; runtime type guards for `links.json`,
`pending.json`, plugin context, workspace-list output, and focus events —
JSON is untrusted input, so guards turn `JSON.parse`'s `any` into validated
types). `bun run build` emits plain CommonJS `spacelinks.js` (committed), so
the runtime stays `node spacelinks.js` with zero dependencies for users; no
Bun binary, for the performance and distribution reasons above. Tests keep
exercising the compiled artifact, so what ships is what is tested.
