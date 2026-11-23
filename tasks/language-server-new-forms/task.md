---
wait_human_start: false
wait_human_merge: false
dependencies: [site-and-readme-new-forms, migrate-tests-new-forms]
---

# Task: The language server understands the new forms

## Metadata

- **Complexity:** High
- **Priority:** Medium
- **Status:** Ready for Handoff

## Context

`packages/language-server` still diagnoses and completes the old attribute-name declarations and `implements`. It must understand presence attributes and arrow-function values, and its tests parse the migrated site examples, so it runs after the site is rewritten.

Vocabulary already has each implementation's raw config, state and events; extend it rather than inventing a second registry.

## Requirements

- [ ] `vocabulary.ts`: expose config and state attribute keys, each event's fields and open flag, and an event-to-owner map.
- [ ] `analysis.ts`: implementation names for an element come from its presence attributes; referenced built-ins and event names derive from them. The bootstrap script's `implementations` attribute is unchanged.
- [ ] `diagnostics.ts`: report the old `implements=` attribute with a message naming the new form; report old `on-x(...)` names; diagnose handler grammar (single or bracketed list, braced bodies only), a concise body with the braced form as the fix, unknown parameter fields on closed events, literal/type mismatches, and bound names used outside their handler. Report `on-<event>` as illegal unless the owning implementation's presence attribute is on the element; validate implementation attribute names against the vocabulary.
- [ ] Remove diagnostics for the old attribute-name declarations, `implements` values and declaration literals.
- [ ] `completion.ts`: complete implementation attribute names at attribute position; after one is present, its config/state attributes and `on-*` events; inside `({ ... })` the event's field names; inside a body the bound names. Remove `implements` value completion.
- [ ] `html.ts`/`offsets.ts`: decoded-to-raw offsets stay exact for spans inside brackets, parameter objects and braced bodies.
- [ ] Update `packages/language-server/tests` and fixtures: every diagnostic and completion case above has a test; the site-example sweep is clean; the obsolete fixtures are removed or migrated.
- [ ] `pnpm build && pnpm check && pnpm test` pass on the committed tree, including the language-server package tests if they are part of the root suite.

## Verification

On the committed tree: `pnpm build && pnpm check && pnpm test` pass. The language-server suite has a test for each diagnostic and completion case named above. `rg -n 'parseEventAttribute|implements' packages/language-server/src` finds no old-form handling; remaining `implementations` matches are the bootstrap attribute.

## Prohibited Patterns

- Do not duplicate implementation metadata in the language server; derive it from the exported implementation definitions.
- Do not complete or diagnose the removed declaration-in-name forms except to report the migration error.
- Do not let offsets drift for text inside brackets, `({ ... })` or `{ ... }`.
- No `/tmp` scratch work; scratch lives in `<repo>/scratch/` and is deleted before finishing.
- No code comments unless requested.
