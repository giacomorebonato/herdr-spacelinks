# AGENTS.md — project memory

Shared conventions for anyone (human or agent) working in this repo.
Check here first; update it when a durable decision changes.

## Tooling decisions (2026-11-06, per user)

**Use Bun, not npm.**

- Bun is the package manager and script runner: `bun install`,
  `bun run <script>`, `bunx` for one-off binaries.
- `bun.lock` is the only lockfile. Never commit a `package-lock.json`, and
  remove one if it ever appears.
- The type check is bun-native: `bun run typecheck` runs `bun check` —
  the npm `typescript` package is not a devDependency.
- `package.json` still exists (bun reads it for scripts/devDependencies).

**herdr runs `bun spacelinks.ts <subcommand>` — no compiled artifact.**

- `herdr-plugin.toml` invokes Bun on the TypeScript source directly; there
  is no build step, and the committed `spacelinks.js` was removed
  (supersedes the bundler-build decision in
  `docs/superpowers/specs/2026-11-06-bun-bundler-build-design.md`).
- Plugin users need Bun on `PATH` (see README). This replaces the earlier
  "Node ≥ 18 only, zero runtime dependencies" install story, per user.
- package.json declares `"type": "module"`, so the `.ts` is a true ES
  module; Bun's CJS interop (`require`/`module` shims) keeps the
  `require.main === module` CLI dispatch working in ESM — verified by
  smoke-running `bun spacelinks.ts` (guard fires on direct run, stays false
  when required by the tests).
- The test suite runs on `bun test` — deliberately: the tests require the
  `spacelinks.ts` source and exercise it against the same runtime herdr
  uses. Bun's ESM interop keeps `require()`/`__dirname` working in the
  now-ESM-context `.js` test file.
- Do **not** build a Bun `--compile` binary: the plugin is spawn-per-action
  and I/O-bound (latency is Bun startup + herdr child processes), and a
  binary would add per-platform artifacts to a cross-platform plugin
  installed from GitHub. TypeScript types were the actual win.

## Project shape

- `spacelinks.ts` is the strongly-typed source of truth (strict mode,
  `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, discriminated
  unions, runtime guards for all untrusted JSON: `links.json`,
  `pending.json`, plugin context, workspace-list output, focus events).
- `bun check` does not emit any artifact; `bun run typecheck` is the
  required gate, and `bun run test` runs `bun test test/spacelinks.test.js`.
- herdr runs `bun spacelinks.ts <subcommand>` per the manifest
  (`herdr-plugin.toml`); plugin users need Bun on `PATH`.

## Working in this repo

- After editing TypeScript: `bun run typecheck` → `bun run test`.
- Tests are `test/spacelinks.test.js`, written against `node:test` but run
  by Bun's runner (`bun test`); they require the `spacelinks.ts` source
  directly, not a compiled artifact.
- Historical notes live in `docs/superpowers/` — dated plans/specs describe
  what was true at the time; don't rewrite them, add a new dated doc for
  new decisions.
