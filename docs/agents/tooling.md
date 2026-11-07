# Tooling & runtime

Read this when touching the toolchain, the manifest, the CLI dispatch, or
anything that could tempt a build step.

## Bun, not npm (2026-11-06 decision, per user)

- Bun is the package manager and script runner: `bun install`,
  `bun run <script>`, `bunx` for one-off binaries — never `npx`.
- `bun.lock` is the only lockfile. Never commit a `package-lock.json`;
  remove one if it ever appears.
- The type check is bun-native: `bun run typecheck` runs `bun check`. The
  npm `typescript` package is deliberately not a devDependency —
  `@types/node` is the only one. `bun check` emits no artifact; it is a
  gate, not a compiler.

## No build step — herdr runs the TypeScript source

- `herdr-plugin.toml` invokes Bun on the source directly: every action,
  pane, startup, and event command is `["bun", "spacelinks.ts", …]`. There
  is no build step; the committed `spacelinks.js` was removed. This
  supersedes the bundler-build decision in
  `docs/superpowers/specs/2026-11-06-bun-bundler-build-design.md`.
- Do **not** build a Bun `--compile` binary: the plugin is spawn-per-action
  and I/O-bound (latency is Bun startup + herdr child processes), and a
  binary would add per-platform artifacts to a cross-platform plugin
  installed from GitHub. TypeScript types were the actual win.
- Plugin users need Bun on `PATH` (the README's Requirements tells them).
  This deliberately replaced the earlier "Node ≥ 18 only, zero runtime
  dependencies" install story, per user.

## ESM/CJS interop facts

`package.json` declares `"type": "module"`, so `spacelinks.ts` is a true
ES module. Bun's interop keeps the CJS-style idioms working unchanged:

- The `require.main === module` CLI-dispatch guard fires on direct runs
  (`bun spacelinks.ts …`) and stays false when the module is required by
  the tests.
- The `.js` test file keeps `require()` and `__dirname` despite the ESM
  package context.

These work under Bun; don't modernize them away.
