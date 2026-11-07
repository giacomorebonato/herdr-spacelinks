# AGENTS.md — herdr-spacelinks

A [herdr](https://herdr.dev) plugin giving each Space its own web links in
the sidebar; `spacelinks.ts` is the entire source, run directly by Bun.

## Essentials

- **Bun, not npm** — `bun install`, `bun run <script>`, `bunx` (never
  `npx`). `bun.lock` is the only lockfile; never commit a
  `package-lock.json`.
- **No build step** — herdr runs `bun spacelinks.ts <subcommand>` per
  `herdr-plugin.toml`. Never create compiled artifacts (`spacelinks.js`,
  `--compile` binaries).
- **After editing TypeScript** — `bun run typecheck`, then `bun run test`.
  (`bun check` is Bun's built-in typechecker; no `typescript` dependency,
  no emitted artifact.)

## Topic guides — read the one matching your task

- [Tooling & runtime](docs/agents/tooling.md) — why Bun, ESM/CJS interop
  facts, what not to build and why
- [TypeScript conventions](docs/agents/typescript.md) — tsconfig as source
  of truth, discriminated unions, runtime guards for all untrusted JSON
- [Testing](docs/agents/testing.md) — node:test API run by `bun test`;
  tests require the `spacelinks.ts` source directly
- [Decisions & history](docs/agents/decisions.md) — docs/superpowers/
  policy, superseded decisions

Durable decision changes update these files *and* add a dated spec under
`docs/superpowers/specs/` — never rewrite history docs.
