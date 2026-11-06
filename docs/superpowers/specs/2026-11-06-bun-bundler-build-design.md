# Build `spacelinks.js` with Bun's bundler — short design

Date: 2026-11-06 · Size: small · Status: implemented

## Intent

Replace the last remaining `tsc` use — the `build` script — with Bun's
bundler (`bun build`, https://bun.com/docs/bundler), per user request.
Continues the existing Bun migration: typecheck already moved to
`bun check` (e3745b0), Bun became package manager (11f3de3). `tsc` now
serves no role; the npm `typescript` package was removed alongside.

## Constraints (from project shape / AGENTS.md)

- Output must stay plain CommonJS at the committed path `spacelinks.js`:
  herdr's manifest spawns `node spacelinks.js`, the test suite
  `require()`s it, and package.json has no `"type"` field.
- Plugin users need only Node ≥ 18: no Bun-only pragmas/globals in the
  artifact (no `// @bun`).
- No `--compile` binary (documented decision).
- Strict type checking keeps gating: `bun build` does not type-check;
  `bun run typecheck` (`bun check`) is its own required step.

## Approaches considered

1. `bun build --format cjs --target node` — chosen. Native, faster,
   single artifact. The `cjs` format is marked experimental in bun's
   docs; the test suite + CLI guard checks are the behavioral guard.
2. `--format esm` + manifest switch to `node spacelinks.mjs` — rejected:
   changes `herdr-plugin.toml` and module semantics for existing plugin
   installs, for zero benefit.
3. Keep `tsc` — rejected: that is what the request removes.

## Decision

- `package.json`:
  `"build": "bun build ./spacelinks.ts --outfile ./spacelinks.js --target node --format cjs"`
  Both flags required: bun's bundler defaults to esm/browser, which plain
  Node cannot load as `spacelinks.js`.
- Removed the unused `typescript` devDependency (verified `bun check`
  passes without it — bun check is bun-native).

## Verification (fresh runs after the change)

- `bun run typecheck`: ✓ No type errors in 187 files.
- `bun run build`: ✓ Bundled 1 module, 26.7K (tsc emitted 32.6K).
- `bun run test`: ✓ 41/41 pass on `node --test` against the rebuilt file
  (the chain rebuilds first, so what ships is what is tested).
- CLI guard: `node spacelinks.js` and `node spacelinks.js nosuchcmd`
  produce output/exit codes identical to the tsc baseline;
  `require('./spacelinks.js')` exposes the same 31 exports; the
  `require.main === module` guard works inside bun's cjs wrapper; the
  artifact starts with `"use strict"` and contains no `@bun` pragma.
