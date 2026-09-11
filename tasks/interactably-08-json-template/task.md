---
wait_human_start: false
wait_human_merge: false
dependencies: [interactably-07-rename-only-impls]
---

# Task: Interactably-08-Json-Template

## Metadata

- **Complexity:** High
- **Priority:** Medium
- **Status:** Ready for Handoff

## Context

Coverage gap found in review: README §9.4 lists `json-template` as an implementation that carries over (rename only), but it is absent. This is the largest port, so it is its own slice. Port the behaviour from behavior-fn (github.com/AceCodePt/behavior-fn) as reference only, including docs/guides/json-template-behavior.md, expressed through defineImplementation and the new host. Depends on interactably-07-rename-only-impls. If a piece is too large you may create sub-tasks within README scope that depend on this task.

## Requirements

- [ ] registry/behaviors/json-template/: renders a <script type="application/json"> data source into the element's <template> with curly-brace interpolation, nested paths, array iteration via data-array, and the || / ?? / && fallback operators (README §9.4; behavior-fn docs/guides/json-template-behavior.md).
- [ ] The data-source id comes from a single config key (json-template-for) following the config naming convention, with an explicit signature.
- [ ] is= attributes inside the template are preserved, and updates to the data source re-render via MutationObserver.
- [ ] src/index.ts re-exports the implementation.
- [ ] node:test + jsdom tests cover interpolation, nested paths, fallbacks, root and nested arrays, and preservation of is= attributes.

## Verification

`pnpm check && pnpm test` pass; registry/behaviors/json-template/ exists with tests and is exported from src/index.ts.

## Prohibited Patterns

- Never create or write files under /tmp or any system temp directory; do scratch work in <repo>/scratch/ and delete it before finishing.
- Do not add runtime dependencies beyond auto-wc and tsyntax.
- Do not use the command attribute/event or any Command Protocol code.
