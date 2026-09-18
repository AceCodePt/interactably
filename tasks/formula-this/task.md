---
wait_human_start: false
wait_human_merge: false
dependencies: []
---

# Task: `this` in the formula grammar

## Metadata

- **Complexity:** Low
- **Priority:** Medium
- **Status:** Ready for Handoff

## Context

README.md:216 gives the formula reference grammar as `'#' id '.' ('value' | 'checked' | 'height' | 'width')`. There is no `this`, so an element computing from its own value must spell its own id — which is impossible inside a `<template>` clone, where ids do not exist. `formula.ts:207-228` `parseReference` only knows `#`. This is step 1 of 3 toward inline expressions (task-inline-expressions.md): the evaluator learns where it is being read from. Worth doing alone regardless.

## Requirements

- [ ] EvalContext (formula.ts:8-10) gains readonly source?: Element. evaluateFormula(source, context) callers pass the element the formula was read from: modifiable.ts compute() passes el. The default context stays { document } with no source.
- [ ] parsePrimary (formula.ts:179) dispatches to parseReference on `#` or on the identifier `this`. parseReference resolves `this` to context.source; if source is undefined the error is `formula "…": this has no element here`. The property rule is unchanged: `this` alone is `reference this needs .value, .checked, .height or .width`.
- [ ] this.value, this.checked, this.height, this.width read through the same readValue/readMeasured paths as #id. No new property. No new coercion.
- [ ] FormulaError.origin for a this reference is the string this.value (etc.), matching how #qty.value appears today, so divisor/empty-operand messages read the same.
- [ ] Parse-time: `this` is a keyword in the formula, so `this(…)` is `unknown function this()` and a bare `this` with no dot is the reference error — pinned by tests.
- [ ] formula.test.ts: this.value reads the source; this.checked on an unchecked box is false; this.height reads measured size; this.value + #other.value mixes fine; evaluation without source throws the "no element here" error; the two parse-error cases.
- [ ] modifiable.test.ts: a modifiable-formula using this.value computes on compute() and on connect.
- [ ] README formula section: grammar becomes `reference := ('#' id | 'this') '.' ('value' | 'checked' | 'height' | 'width')`; one sentence: "`this` is the element the formula is on — the same `this` as in a trigger." One row added to the construct table. site/docs.html mirrors. One site example switches from a self-id to `this` where it reads better.
- [ ] pnpm check, pnpm build, pnpm test green; test count not below baseline.

## Verification

`pnpm check && pnpm build && pnpm test`; `rg -n "this\.(value|checked|height|width)" registry/utils/formula.test.ts` shows the new cases.

## Prohibited Patterns

- Do not add valueAsNumber or any other property to the formula grammar here — that is the inline-expressions decision.
- Do not touch the trigger parser (parser.ts).
- No code comments beyond the brief's.
