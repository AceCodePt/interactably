# AGENTS.md

## Design source of truth

`site/docs.html` is the design document, `site/reference.html` the implementation catalogue, and `site/examples.html` the working examples. `README.md` is the package entry point: it summarises the site and links into it, and it must never be the only place a fact lives. This file's directory layout is authoritative: `registry/interactable/` (parser, executor, keys, events, signature, attributes) and `registry/behaviors/` (the host, the registry, and the implementations).

A change to any implementation's tags, verbs, config, state or events updates the table in `docs.html`, the card in `reference.html`, the row in the README table, and the chip in `index.html` — the parity test in `tests/site-smoke.test.ts` enforces all four.

## Working constraints

- ESM: imports use the tsconfig `paths` aliases (`@/*`, `@interactable/*`, `@behaviors/*`, `@utils/*`, `@tests/*`) with explicit `.ts` extensions, resolved at runtime by tsx (tests) and rolldown (build); Node-native type stripping no longer runs the source directly.
- `pnpm` is the package manager.
- `node:test` is the only test runner.
- `jsdom` is a dev-only dependency, for tests.
- The only runtime dependency is `tsyntax`.

## Signatures

Every `config`, `state` and verb scalar signature is a [tsyntax](https://github.com/AceCodePt/tsyntax) string, checked at compile time and at runtime. When a field has a finite set of legal values, spell the set out explicitly as a tsyntax union (for example `"'get' | 'post' | 'put' | 'delete' | 'patch' | undefined"` or `"'latest' | 'first' | 'all' | undefined"`), never as a bare `string`. Use a TypeScript union type for internal non-DSL values. A bare `string` is reserved for genuinely open-ended values such as selectors, URLs and free text.

## Verification

Before a task is declared done, both must pass on the committed tree:

- `pnpm check` — `tsc --noEmit`
- `pnpm test` — `node --test` under the `tsx` loader (`node --import tsx`); `tsx` is a dev-only dependency because `tsyntax` ships as `.ts` source and Node's native type stripping refuses `node_modules` files.

`pnpm test` requires `pnpm build` first: the site tests load `dist/site/demo.js`; run `pnpm build && pnpm test` on a fresh checkout. `pnpm build:site` is a Pages concern and is not needed for the suite.

## TypeScript posture

New code must type-check under the strict tsconfig: no `any`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`.

## Rules

- Never create or write files under /tmp or any system temp directory; do scratch work in `<repo>/scratch/` and delete it before finishing.
- No code comments unless requested.