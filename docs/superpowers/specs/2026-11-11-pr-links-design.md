# PR links — design

Date: 2026-11-11

## Intent

When an agent (or the user) working in a Space opens a PR, the PR's URL
should appear automatically in that Space's spacelinks, titled with the
repo name — no manual `add`.

## Why

PRs are the natural per-Space artifact: agents open them, the user then
wants one-click access from the sidebar. Today the flow is manual (open
popup, paste URL), and the PR URL is already printed in the pane.

## Goals

- New PR for the Space's checked-out branch → link `{title: repoName,
  url: prUrl}` added, tokens re-reported.
- Near-instant for detected agents (sync on turn end), fresh on next
  focus; optional `gh` shim makes it instant at creation.
- Silent best-effort: no gh / not a repo / not authed → skip without
  errors reaching the UI.

## Non-goals

- Pruning merged/closed PRs — manual `d` delete stays the only removal.
- Non-GitHub hosts (gh only).
- Tracking multiple PRs per repo — first open PR per repo wins.
- Auto-installing the shim (plugins can't touch PATH); documented
  manual opt-in.

## Constraints (verified against herdr 0.9.5)

- No PR/git-push event exists; usable hooks: `workspace.focused` (in
  use) and `pane.agent_status_changed` (hunk plugin proves pane.*
  hooks fire).
- `herdr pane list --workspace <id>` exposes per-pane `cwd` and
  `foreground_cwd` → how sync finds the repo.
- Socket `plugin.action.invoke` honors `context.workspace_id` (probe:
  action ran scoped to `wB` while `wE` focused) but drops unknown
  context keys; action process receives full plugin env. Focused-pane
  context fields come from the *active* workspace, so sync must never
  trust context cwd/label — only the id.
- Pane processes receive `HERDR_WORKSPACE_ID` + `HERDR_SOCKET_PATH` →
  what the shim uses.
- No daemon: startup hooks are one-shot; detached background processes
  are not protected.

## Approaches

1. **Focus + agent-turn scan (chosen, zero setup).** Sync on
   `workspace.focused` and on `pane.agent_status_changed` → idle/done.
   Covers all PR-opening agents herdr detects; freshness = turn end /
   next focus.
2. **`gh` PATH shim (chosen, opt-in).** Ships as `shim/gh` (bun script):
   resolves the real gh on PATH, streams it transparently, and on
   successful `gh pr create` whose output contains a GitHub PR URL,
   socket-invokes the plugin's `sync` action with
   `context.workspace_id = $HERDR_WORKSPACE_ID`. Instant at creation;
   only fires for `gh` CLI usage.
3. **Watcher daemon (rejected).** Violates herdr's plugin model and
   duplicates what 1+2 achieve.

1 and 2 share one core; 2's action is 1's routine.

## Design

### Core: `syncWorkspacePrs(state, workspaceId, run)`

1. `herdr pane list --workspace <id>` → dedupe pane `cwd` +
   `foreground_cwd`.
2. For each dir that is a git repo with a `github.com` origin:
   branch = `git rev-parse --abbrev-ref HEAD` (detached → skip);
   `gh pr list --head <branch> --state open --json url --limit 10`.
3. First PR per repo: title = repo name from origin URL (strip `.git`),
   URL added if not stored already (dedupe by URL, respect the 9-link
   cap, silent skip when full).
4. If anything was added: write state + `reportTokens`.
5. Any failure (gh missing, no auth, not a repo) → silent skip, one
   plugin-log line.

### Triggers (manifest)

- `workspace.focused` → `refresh` subcommand extended: existing
  republish, then best-effort sync (debounced per workspace: skip if
  last sync < 60 s ago, timestamps in a new `prsync.json` state file —
  keeps `links.json` schema untouched).
- `pane.agent_status_changed` → new `sync` subcommand: resolve
  workspace from event JSON (fall back: pane → workspace via pane
  list); only sync when the new status is `idle` or `done`.
- New action `[[actions]] id = "sync"` (`bun spacelinks.ts sync`) — the
  shim's target and a manual right-click trigger. `contexts =
  ["workspace"]`.

### Shim: `shim/gh` (bun, single file)

- Resolve real gh: first `gh` on PATH whose directory ≠ this script's.
- Always `spawn` real gh with all args, stdio inherited — output stays
  byte-identical.
- After exit 0, only if argv matched `pr create`: regex stdout + stderr
  for `https://github.com/<owner>/<repo>/pull/<n>`; on match, connect
  to `$HERDR_SOCKET_PATH`, send `plugin.action.invoke` for
  `spacelinks.sync` with `context.workspace_id =
  $HERDR_WORKSPACE_ID`; ignore failures silently. Not in a herdr pane
  (no env) → behave exactly like real gh.
- README: optional install (`cp shim/gh ~/.local/bin/gh`, dir on PATH
  ahead of real gh), what it does, how to remove.

## Left to the builder

- Verify `pane.agent_status_changed` event JSON shape at implementation
  time (assumed: at least `pane_id`; workspace resolved via pane
  list).
- Tests for: origin-URL title derivation, branch/PR matching via
  injected `run`/spawn fakes, debounce file, URL dedupe + cap.
- Confirm sync's gh calls go through an injectable runner like
  `herdrRun` for testability.
