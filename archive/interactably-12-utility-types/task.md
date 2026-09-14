---
wait_human_start: false
wait_human_merge: false
dependencies: [interactably-11-infer-implementation-types]
---

# Task: Interactably-12-Utility-Types

## Metadata

- **Complexity:** Medium
- **Priority:** Low
- **Status:** Ready for Handoff

## Context

Housekeeping slice: the implementation-definition module currently mixes the runtime defineImplementation machinery with a pile of exported type utilities (Tag, El, Slot, SlotOf, ArgOf, Attrs, Implementation, Validated*, ValidatedSigs, ImplementationDef, KW). Move the type-level utilities into their own module so the runtime file only holds runtime code, matching behavior-fn's original types.ts split. Imports use the tsconfig path aliases (interactably-10 landed them) with the .ts extension. Depends on interactably-11-infer-implementation-types.

## Requirements

- [ ] Move the type-level utilities out of registry/behaviors/_implementation-definition.ts into a dedicated types module (registry/behaviors/types.ts): Tag, El, Slot, SlotOf, ArgOf, Attrs, Implementation, ImplementationDef, Validated, ValidatedSlot, ValidatedSig, ValidatedSigs, and KW; Ctor/Sig may be imported and re-exported from the interactable signature module.
- [ ] _implementation-definition.ts keeps only runtime code (defineImplementation plus validateSlots/compileAttrs/compileVerbs/registerImplementation wiring) and imports the moved types from the new module.
- [ ] The public export surface is unchanged: src/core.ts still re-exports the same type names (Attrs, ArgOf, El, Implementation, ImplementationDef, Sig, Slot, Tag) and they resolve through the same aliases.
- [ ] Imports use the tsconfig path aliases with the .ts extension; `pnpm check` and `pnpm test` pass on the committed tree.

## Verification

`pnpm check && pnpm test` pass; registry/behaviors/types.ts exists and _implementation-definition.ts contains no exported type definitions beyond re-exports/imports; the names exported from src/core.ts are unchanged.

## Prohibited Patterns

- Never create or write files under /tmp or any system temp directory; do scratch work in <repo>/scratch/ and delete it before finishing.
- Do not add or remove runtime dependencies.
- Do not change any runtime behaviour or the public export surface - this is a pure module move.
