# AGENTS.md — project memory

Shared conventions for anyone (human or agent) working in this repo.
Check here first; update it when a durable decision changes.

## Tooling decision (2026-11-06, per user)

**Use Bun, not npm.**

- Bun is the package manager and script runner: `bun install`,
  `bun run <script>`, `bunx` for one-off binaries.
- `bun.lock` is the only lockfile. Never commit a `package-lock.json`, and
  remove one if it ever appears.
- `package.json` still exists (bun reads it for scripts/devDependencies).
- The test suite runs on `node --test` even when invoked via
  `bun run test` — deliberately: the tests exercise the compiled
  `spacelinks.js` against the same runtime herdr uses.

## Project shape

- `spacelinks.ts` is the strongly-typed source of truth (strict mode,
  `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, discriminated
  unions, runtime guards for all untrusted JSON: `links.json`,
  `pending.json`, plugin context, workspace-list output, focus events).
- `bun run build` compiles it to plain CommonJS `spacelinks.js`
  (committed). **Always commit the regenerated `spacelinks.js` together
  with the `spacelinks.ts` change.**
- herdr runs `node spacelinks.js <subcommand>` per the manifest
  (`herdr-plugin.toml`); plugin users need only Node ≥ 18 — zero runtime
  dependencies, no Bun on the user's machine.
- Do **not** build a Bun `--compile` binary: the plugin is spawn-per-action
  and I/O-bound (latency is Node startup + herdr child processes), and a
  binary would add per-platform artifacts to a cross-platform plugin
  installed from GitHub. TypeScript types were the actual win.

## Working in this repo

- After editing TypeScript: `bun run typecheck` → `bun run build` →
  `bun run test` (which rebuilds first, so what ships is what is tested).
- Tests are `test/spacelinks.test.js` on `node:test`; they intentionally
  require the compiled `spacelinks.js`, not the `.ts` source.
- Historical notes live in `docs/superpowers/` — dated plans/specs describe
  what was true at the time; don't rewrite them, add a new dated doc for
  new decisions.
