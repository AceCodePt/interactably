---
wait_human_start: false
wait_human_merge: false
dependencies: []
---

# Task: Interactably-10-Path-Aliases

## Metadata

- **Complexity:** Medium
- **Priority:** High
- **Status:** Ready for Handoff

## Context

Project decision (user-approved): replace all relative imports in the Interactably source with tsconfig `paths` aliases, keep the explicit `.ts` extension, emit real type declarations so consumers do not need to mirror the aliases, and record the new import convention in AGENTS.md. Everything is archived and the base is settled, so this is a single mechanical slice with no dependencies. tsx resolves tsconfig paths at runtime (the test loader), rolldown does too via its top-level `tsconfig` option, and tsc resolves them for typechecking. Node-native type stripping no longer runs the source directly.

## Requirements

- [ ] tsconfig.json gains baseUrl "." and paths: "@/*" → "./src/*", "@interactable/*" → "./registry/interactable/*", "@behaviors/*" → "./registry/behaviors/*", "@utils/*" → "./registry/utils/*", "@tests/*" → "./tests/*".
- [ ] Every relative .ts import across registry/, src/ and tests/ is rewritten to the matching alias, keeping the explicit .ts extension (e.g. @behaviors/modifiable.ts, @interactable/parser.ts, @utils/auto-loader.ts, @tests/jsdom.ts, @/core.ts); node: built-ins (node:test, node:assert/strict), jsdom and the tsyntax/auto-wc package imports stay as-is.
- [ ] rolldown.config.mjs gains the top-level tsconfig: "./tsconfig.json" option so rolldown parses the paths, and the externalizeCore plugin is updated to resolve alias specifiers against the same paths before matching the core file set, so the dist/cdn core externalization still works.
- [ ] A tsconfig.build.json (extends the base) emits declarations: declaration true, emitDeclarationOnly true, outDir dist/types, rootDir ".".
- [ ] A post-build step rewrites alias specifiers in the emitted .d.ts files back to relative (with .js extension) imports, because tsc preserves the written specifier; after the rewrite no emitted declaration contains an alias specifier.
- [ ] package.json types → ./dist/types/index.d.ts, exports/types point at the emitted declarations, per-implementation .d.ts files are emitted under dist/cdn so the ./dist/cdn/* subpath stays typed, and `pnpm build` runs rolldown, the declaration emit, and the rewrite (build: "rolldown -c && tsc -p tsconfig.build.json && node scripts/rewrite-dts-imports.mjs").
- [ ] AGENTS.md's import-convention line documents the alias scheme: imports use the tsconfig paths aliases with the .ts extension, resolved at runtime by tsx (tests) and rolldown (build); Node-native type stripping no longer runs the source directly.
- [ ] Verification in-repo: `pnpm check` and `pnpm test` stay green; `pnpm build` exits 0 producing dist JS and dist/types/*.d.ts; a grep over dist/types shows zero alias specifiers; a smoke test imports dist/interactably.js and one dist/cdn bundle.

## Verification

`pnpm check && pnpm test` pass; `pnpm build` exits 0 and emits dist/interactably.js, dist/cdn/*.js, dist/types/**/*.d.ts with no alias specifiers (grep '@behaviors|@interactable|@utils|@tests|@/' on dist/types returns nothing); a smoke test loads the built core and one CDN bundle.

## Prohibited Patterns

- Never create or write files under /tmp or any system temp directory; do scratch work in <repo>/scratch/ and delete it before finishing.
- Do not add runtime dependencies beyond auto-wc and tsyntax; tsx, jsdom, rolldown and typescript stay dev-only.
- Do not change any API, behaviour, or test logic - this is an import-specifier and build/types wiring change only.
- Do not leave any relative .ts import in registry/, src/ or tests/ after the sweep.
