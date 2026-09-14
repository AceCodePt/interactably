---
wait_human_start: false
wait_human_merge: false
dependencies: [interactably-13-storable-rename]
---

# Task: Interactably-14-Modifiable-Formula-Engine

## Metadata

- **Complexity:** High
- **Priority:** High
- **Status:** Ready for Handoff

## Context

The formula engine replaces three pull-style implementations (compute, summable, element-counter) and format with one DSL on modifiable. This slice adds the engine and folds compute in while summable/element-counter/format still exist, so the suite stays green; the next slice retires them. User-approved design: sum/count take a query selector evaluated against document.querySelectorAll (scoping written into the selector, e.g. sum('#list .amount')); count is matched elements; format mirrors Intl; precision is dropped because format owns presentation; modifiable-invalid-value is kept. Depends on interactably-13-storable-rename.

## Requirements

- [ ] Add registry/utils/formula.ts: a hand-written expression parser extending today's compute parser with string literals ('...'), object literals ({ key: value }), and the functions sum(selector), count(selector) and format(value, options), on top of the existing numbers, + - * /, unary minus, parentheses, #id references and min/max/floor/ceil/round.
- [ ] sum(selector) adds valueOf(el) over document.querySelectorAll(selector); count(selector) returns the number of matched elements; scoping is expressed inside the selector, e.g. sum('#list .amount').
- [ ] format(value, { locale?, type?, ...IntlOptions }) returns a string: type defaults to 'number' and uses Intl.NumberFormat, type 'date' parses the value as a date and uses Intl.DateTimeFormat; locale defaults to 'en-US'; every other option key passes straight through to the matching Intl constructor so the full Intl option surface is available (style, currency, notation, minimumFractionDigits, dateStyle, timeStyle, ...). Percent follows Intl semantics (the value is a fraction).
- [ ] #id references resolve to the element's raw value string (.value or textContent) and are coerced with Number where arithmetic needs a number, so the same reference works for numeric and date formulas.
- [ ] The engine returns { text: string; value: number | null }: a numeric expression yields text=String(n), value=n; format yields the formatted text and carries the wrapped number forward as value.
- [ ] Fold compute into modifiable: add config formula -> modifiable-formula (string | undefined) and invalid-value -> modifiable-invalid-value (string | undefined, default "Error"); add a compute: "undefined" verb and a connectedCallback that computes when modifiable-formula is present; the result writes text to .value/textContent and value to data-value when numeric, with no synthetic input event. Drop precision entirely.
- [ ] Delete registry/behaviors/compute/ (implementation and test), remove its export from src/index.ts and its entry from rolldown.config.mjs, and move its test coverage into registry/behaviors/modifiable/modifiable.test.ts under the new modifiable-formula attribute names.
- [ ] `pnpm check`, `pnpm test` and `pnpm build` pass.

## Verification

`pnpm check && pnpm test && pnpm build` pass; tests in registry/behaviors/modifiable/modifiable.test.ts cover arithmetic (#a * #b), sum(selector), count(selector), format(value, { style: 'currency', currency: 'USD' }), format(value, { type: 'date', dateStyle: 'medium' }), the modifiable-invalid-value fallback, and that compute writes textContent and data-value without dispatching input; registry/behaviors/compute no longer exists and dist/cdn/compute.js is not built.

## Prohibited Patterns

- Never create or write files under /tmp or any system temp directory; do scratch work in <repo>/scratch/ and delete it before finishing.
- Do not add or remove runtime dependencies; the engine is hand-written, not a parser library.
- Do not dispatch a synthetic input event from the compute path - a computed value is a derived output, unlike set.
- Do not declare precision on modifiable; formatting is format's job.
- Do not change the existing summable, element-counter or format implementations in this slice - they are retired in the next task.
