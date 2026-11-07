# Testing

Read this when writing or modifying tests.

- Tests live in `test/spacelinks.test.js` — one file, written against the
  `node:test` / `node:assert` APIs but run by Bun's runner:
  `bun run test` = `bun test test/spacelinks.test.js`.
- They `require('../spacelinks.ts')` — the TypeScript source directly,
  never a built artifact. Deliberate: the tests exercise the exact file
  and runtime herdr executes.
- Bun's interop keeps `require()` and `__dirname` working in the test
  file even though the package is `"type": "module"` (ESM context).
- The panel smoke test spawns `process.execPath` (Bun, under `bun test`)
  on `spacelinks.ts`, so the direct-invocation path herdr uses is under
  test too.
- After editing TypeScript: `bun run typecheck` → `bun run test`.
