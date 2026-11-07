# TypeScript conventions

Read this before editing `spacelinks.ts`.

- `spacelinks.ts` is the single, strongly-typed source of truth — there is
  no other implementation, nothing generated, nothing compiled.
- `tsconfig.json` is canonical for compiler settings; read it rather than
  trusting a summary. Beyond `strict` it notably enforces
  `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
  `noImplicitOverride`, `noFallthroughCasesInSwitch`, `noUnusedLocals`,
  and `noUnusedParameters`.
- Model operations as discriminated unions (e.g. `MenuAction`: the `op`
  narrows which extra fields exist) — not optional-field soup.
- Runtime-guard **all** untrusted JSON before use; it is hand-editable or
  produced by another process: `links.json`, `pending.json`, the plugin
  context, workspace-list output, and focus events. Validate at the
  boundary and throw on corrupt input (`readState`'s `corrupt: …` errors
  are the established pattern).
- After any edit, the gate is `bun run typecheck` → `bun run test` (see
  the root AGENTS.md).
