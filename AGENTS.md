# AGENTS.md

## Design source of truth

README.md is the single source of truth for the design of Interactably. Reference its sections rather than restating the design here. Its directory layout is authoritative: `registry/interactable/` (parser, executor, keys, events, signature, attributes) and `registry/behaviors/` (the host, the registry, and the implementations).

## Working constraints

- ESM with Node native type stripping (`erasableSyntaxOnly`): relative imports use explicit `.ts` extensions.
- `pnpm` is the package manager.
- `node:test` is the only test runner.
- `jsdom` is a dev-only dependency, for tests.
- The only runtime dependencies are `auto-wc` and `tsyntax`.

## Verification

Before a task is declared done, both must pass on the committed tree:

- `pnpm check` — `tsc --noEmit`
- `pnpm test` — `node --test` under the `tsx` loader (`node --import tsx`); `tsx` is a dev-only dependency because `tsyntax` ships as `.ts` source and Node's native type stripping refuses `node_modules` files.

## TypeScript posture

New code must type-check under the strict tsconfig: no `any`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`.

## Rules

- Never create or write files under /tmp or any system temp directory; do scratch work in `<repo>/scratch/` and delete it before finishing.
- No code comments unless requested.