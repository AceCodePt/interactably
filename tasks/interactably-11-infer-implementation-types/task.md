---
wait_human_start: false
wait_human_merge: false
dependencies: [interactably-10-path-aliases]
---

# Task: Interactably-11-Infer-Implementation-Types

## Metadata

- **Complexity:** Low
- **Priority:** Medium
- **Status:** Ready for Handoff

## Context

User-verified cleanup: the `const` type parameters on defineImplementation already infer, so the explicit type arguments in seven implementation files are redundant duplication of the declaration object. Evidence: revealable, auto-grow, condition, paste-transform, storage and json-template call defineImplementation with no type arguments and type-check cleanly, including union signatures. Depends on interactably-10-path-aliases because that slice rewrites imports in the same files.

## Requirements

- [ ] Remove the explicit defineImplementation<...> type argument lists from no-propagate, prevent-default, attributable, compute, format, element-counter and logger so each call reads defineImplementation("name", { ... }, factory) with the declaration object as the single source of truth.
- [ ] The factory parameter types must stay precise after the change (e.g. attributable's setAttr arg is still { name: string; value: string }, element-counter's count arg still { root: HTMLElement; select: string }).
- [ ] If any signature genuinely fails to infer, adjust the defineImplementation parameter type in _implementation-definition.ts (e.g. verbs: V & ValidatedSigs<V>) rather than re-annotating call sites.
- [ ] `pnpm check` and `pnpm test` pass on the committed tree.

## Verification

`pnpm check && pnpm test` pass; grep shows zero `defineImplementation<` call sites in registry/behaviors (only the definition itself).

## Prohibited Patterns

- Never create or write files under /tmp or any system temp directory; do scratch work in <repo>/scratch/ and delete it before finishing.
- Do not add or remove runtime dependencies.
- Do not change any runtime behaviour, declaration content, or test logic - only the call-site type arguments go away.
