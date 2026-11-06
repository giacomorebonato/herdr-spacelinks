# Run `spacelinks.ts` directly with Bun — short design

Date: 2026-11-06 · Size: small · Status: implemented

## Intent

Per user request, drop the compiled-artifact pipeline: herdr invokes Bun on
the TypeScript source (`bun spacelinks.ts`), the committed `spacelinks.js`
goes away, and nothing builds or ships a bundle. Replaces the "plugin users
need only Node ≥ 18, zero runtime dependencies" install story with "plugin
users need Bun" — the earlier goal is reversed deliberately, per user.

## Constraints

- All five manifest commands change: `["node", "spacelinks.js", X]` →
  `["bun", "spacelinks.ts", X]` (open, add, panel, startup apply,
  workspace.focused refresh).
- The `require.main === module` CLI dispatch must keep working under Bun.
- Strict type checking stays the separate required gate (`bun check`).
- Historical docs in `docs/superpowers/` stay untouched (convention).

## Approaches considered

1. Bun runs `spacelinks.ts` directly — chosen. One source of truth, no
   artifact to regenerate or commit, no build script, and the tests now
   exercise exactly what herdr executes (same file, same runtime).
2. Keep the bundler build (`2026-11-06-bun-bundler-build-design.md` in
   this directory) — rejected: that pipeline is what the request removes.
3. `bun build --compile` binary — rejected (documented decision): per-
   platform artifacts for a cross-platform plugin installed from GitHub;
   the plugin is spawn-per-action and I/O-bound.

## Decision

- `herdr-plugin.toml`: every `command` becomes `["bun", "spacelinks.ts", …]`.
- `package.json`: `build` script removed; `test` is
  `bun test test/spacelinks.test.js` (no rebuild step).
- `test/spacelinks.test.js`: requires `../spacelinks.ts`; the panel smoke
  spawns `process.execPath` (bun, under `bun test`) on `spacelinks.ts`.
- `spacelinks.js` deleted (938 lines); stale header/dispatch comments in
  `spacelinks.ts`, plus README and AGENTS.md, updated.
- package.json declares `"type": "module"` (added same day, after the
  initial switch): the `.ts` is a true ES module, and Bun's CJS interop
  keeps the CJS-style `require.main === module` guard working unchanged —
  verified: it fires on direct run and stays false when required.

## Verification (fresh runs after the change, `"type": "module"` in place)

- `bun run typecheck` (`bun check`): ✓ No type errors in 187 files.
- `bun run test` (`bun test`): ✓ 41/41 pass with the package declared ESM,
  requiring `spacelinks.ts`; the key-mode spawn tests run
  `bun <root>/spacelinks.ts panel`.
- CLI guard: `bun spacelinks.ts` / `bun spacelinks.ts nosuchcmd` →
  `spacelinks: unknown subcommand …`, exit 1; `bun spacelinks.ts open`
  without env → `spacelinks: cannot resolve current space from context`,
  exit 1 — the `require.main === module` dispatch still fires with the
  package in ESM mode (Bun's CJS interop) and stays false when the module
  is required by the tests.
- Sweep: no `spacelinks.js`, `node --test`, `bun run build`, or manifest
  `"node"` references remain outside `docs/superpowers/` (historical)
  and tsconfig's `"types": ["node"]` type-library name.
