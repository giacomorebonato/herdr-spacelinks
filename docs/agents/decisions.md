# Decisions & history

- Durable decisions are recorded twice: the living convention goes in
  `AGENTS.md` / `docs/agents/`, and the reasoning lands in a dated doc
  under `docs/superpowers/` (specs for designs, plans for step-by-step
  execution).
- `docs/superpowers/` is history: dated plans and specs describe what was
  true at the time. Don't rewrite them — add a new dated doc for new
  decisions instead.

## Superseded decisions — do not resurrect

- **Bundler build** (`docs/superpowers/specs/2026-11-06-bun-bundler-build-design.md`,
  build `spacelinks.js` with `bun build`) is superseded by the direct
  runtime (`docs/superpowers/specs/2026-11-06-bun-direct-runtime-design.md`):
  herdr runs `bun spacelinks.ts` with no compiled artifact. The latter is
  current.
- The "Node ≥ 18 only, zero runtime dependencies" install story died with
  it — plugin users need Bun on `PATH` (see [tooling.md](tooling.md)).
- No Bun `--compile` binary — rejected in the direct-runtime design;
  rationale in [tooling.md](tooling.md).
