---
wait_human_start: false
wait_human_merge: false
dependencies: [interactably-14-modifiable-formula-engine]
---

# Task: Interactably-15-Retire-Summable-Counter-Format

## Metadata

- **Complexity:** Medium
- **Priority:** Medium
- **Status:** Ready for Handoff

## Context

Retire the three implementations the formula engine replaces. summable and element-counter are superseded by sum(selector)/count(selector) inside modifiable-formula, and format is superseded by the format(value, options) formula function. Depends on interactably-14-modifiable-formula-engine, which added the engine while these still existed. The README is the design source of truth, so its examples and the section 9.4 migration table must move to the formula in the same slice.

## Requirements

- [ ] Delete registry/behaviors/summable/, registry/behaviors/element-counter/ and registry/behaviors/format/ (implementations and their tests).
- [ ] Remove their exports from src/index.ts (summable, elementCounter, format) and their entries from rolldown.config.mjs, and drop them from any README list that names them.
- [ ] Migrate registry/behaviors/price-calculator.test.ts to modifiable-formula: the total output uses implements="modifiable" with modifiable-formula (e.g. format(sum('#list .amount'), { style: 'currency', currency: 'USD' })) and the buttons call #total.compute() instead of #total.sum({root, select}).
- [ ] Update README to the formula design: section 5's total example (line ~91), the section 6 summable code example (~228-237), the section 6 config example that names summable-precision (~252), the section 7 worked example (~680-713), section 9.4's compute/format/element-counter row (~654), section 10's dynamic-data-sources row (~462-463), and the record-argument examples in section 11.21 (~54, 106, 284, 846) which must now use attributable.setAttr({name, value}) since sum({root, select}) no longer exists.
- [ ] `pnpm check`, `pnpm test` and `pnpm build` pass.

## Verification

`pnpm check && pnpm test && pnpm build` pass; rg finds no implementation named summable, element-counter or format in registry/src/rolldown.config.mjs (the format() formula function and Intl usage excepted); dist/cdn no longer contains summable.js, element-counter.js or format.js; price-calculator.test.ts exercises the formula path and passes.

## Prohibited Patterns

- Never create or write files under /tmp or any system temp directory; do scratch work in <repo>/scratch/ and delete it before finishing.
- Do not add or remove runtime dependencies.
- Do not leave any dangling reference to summable, element-counter, elementCounter or format as an implementation - only the format() formula function remains.
- Do not weaken or delete tests that still describe live behaviour; migrate the coverage to modifiable-formula instead.
