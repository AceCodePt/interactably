---
wait_human_start: false
wait_human_merge: false
dependencies: [interactably-03-generic-impls]
---

# Task: Interactably-04-Value-Impls

## Metadata

- **Complexity:** High
- **Priority:** High
- **Status:** Ready for Handoff

## Context

Clean-room implementation slice 4 of the Interactably design (README.md §5.3, §5.4, §6, §9.4 rows). Build the value/content/state implementations and port their logic from behavior-fn as reference only: modifiable (absorbing set-value and set-content), dirtyable, listable, summable, attributable, logger, and the on-demand verbs for compute/format/element-counter. Depends on interactably-03-generic-impls. Tests use node:test with jsdom, and must include the README §10.1 price-calculator end-to-end example. If a piece is too large you may create sub-tasks within README scope that depend on this task.

## Requirements

- [ ] registry/behaviors/modifiable/: tags [input, textarea, output, select], config step, verbs set(string)/inc(number|undefined)/dec(number|undefined)/clear(undefined)/reset(undefined); writes the platform property (or textContent when the element has no .value), dispatches a synthetic input event, clamps via the platform's own min/max, and reset returns to the authored value attribute (README §5.3, §5.4, §9.4).
- [ ] registry/behaviors/dirtyable/: no attributes written, closure baseline captured at connect, onInput render toggles is-dirty, and a markClean() verb (README §6, §9.4).
- [ ] registry/behaviors/listable/: tags [ul, ol, tbody], config min-rows, verbs removeRow(HTMLElement)/adopt(HTMLTemplateElement)/clear(undefined) per README §5.3.
- [ ] registry/behaviors/summable/: tags [output, span, td], config precision, verb sum({root: HTMLElement, select: string}) writing textContent and data-value (README §5.3).
- [ ] registry/behaviors/attributable/: verbs setAttr({name, value})/toggleAttr(name)/removeAttr(name) replacing set-attribute (README §9.4).
- [ ] registry/behaviors/logger/: verb log(string|number|boolean|undefined), no trigger attribute; the trigger is context read from e.source (README §9.4).
- [ ] compute/format/element-counter keep their pull config and gain on-demand verbs compute(), format(kind) and count({root, select}) (README §9.4).
- [ ] Add the valueOf(el) helper (.value then data-value then parsed textContent) and use it wherever a number is read (README §6).
- [ ] Tests cover each implementation's verbs and the full README §10.1 price-calculator flow (modifiable + dirtyable + listable + summable interacting through on-* triggers and the interaction event).

## Verification

`pnpm check && pnpm test` pass; per-implementation tests exist and a price-calculator end-to-end test reproduces the README §10.1 trace (inc, clamp, synthetic input, dirty, preview set, removeRow plus sum, adopt).

## Prohibited Patterns

- Never create or write files under /tmp or any system temp directory; do scratch work in <repo>/scratch/ and delete it before finishing.
- Do not add runtime dependencies beyond auto-wc and tsyntax.
- Do not declare platform-owned attributes (min, max, step, type, open, value, checked, popover) in config/state; read them off the element (README §11.25).
- Do not implement requestable or validatable in this slice.
