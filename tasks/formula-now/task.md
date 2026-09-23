---
wait_human_start: false
wait_human_merge: false
dependencies: []
---

# Task: now() formula function, the epoch-ms id source

## Metadata

- **Complexity:** Low
- **Priority:** Medium
- **Status:** Ready for Handoff

## Context

`renderable` requires the author to supply a unique id for a rendered row, and nothing in the expression language can produce one from the DOM. count() reuses a live id after a delete; sum()-plus-one doubles each time and leaves safe-integer range after ~30 rows; max()+1 would need rows to carry their number in a hidden input because sum's machinery reads element values via readValue, and an id lives in the id attribute, not a value. A timestamp sidesteps all of it by never looking at the existing set. This does NOT reopen the Temporal park ruling (2026-09-17): that ruling was about date arithmetic — dates read as strings, no conversions. now() returns a plain number, does no date arithmetic, and touches no value typing; it sits next to count(), not next to Temporal.

## Requirements

- [ ] registry/utils/formula.ts applyFunction (l.365): a `case "now":` beside count (l.387): `requireArity(name, args.length, 0)`, then return `Date.now()` at fire time and a stable constant (0) when `context.dryRun === true`, matching how sum/count/requireNumber stub dry runs. Returns a number. The dry-run stub is what makes parse-only validation deterministic.
- [ ] Parse time: `parseFormula("now()")` and `parseFormula("now() + 1")` succeed with no document or source; `parseFormula("now(1)")` and `parseFormula("now('x')")` throw the arity error naming now(). The unknown-function test at formula.test.ts:909 still fails for a made-up name (do not weaken it).
- [ ] registry/utils/formula.test.ts tests: 1) `evaluateFormula("now()").value` is a number. 2) two sequential `evaluateFormula("now()")` calls are numbers and the second is >= the first (epoch-ms monotonicity, equal within one millisecond allowed). 3) `'row-' + now()` reads a string starting `row-` (the documented prefix pattern joins). 4) arity failures: `now(1)` throws `now() takes 0 arguments`, same shape as the existing round()/length() arity tests. 5) dry run: `parseFormula("now()")` passes with no element present.
- [ ] registry/interactable/attach.test.ts: one executor test through start() proving the motivating pattern — an attributable element with `on-click="this.setAttr({name: 'id', value: 'row-' + now()})"` clicked twice yields two distinct ids, both prefixed `row-` (mirror the shape of the length() counter test at l.458).
- [ ] site/docs.html: 1) grammar line l.331 `function := ... | length` gains `| now`. 2) the Typed + row (l.341) list of number-returning functions gains now. 3) a table row after length (l.345): example like `#row.setAttr({name: 'id', value: 'row-' + now()})`, meaning the current epoch milliseconds as a number, stable under parse validation, with the collision caveat. 4) a sentence in the expressions section (~l.354) noting that two renders inside the same millisecond collide and that ids must not begin with a digit in older specs, so templates should prefix: `id="row-{id}"`.
- [ ] README.md: nothing to add — it is the hook and defers the expression grammar to docs.html (verify with grep before assuming; do not add a formula enumeration that duplicates docs.html). reference.html also defers expressions to the docs (`expr := <expression> (see the docs)`) and needs no change — confirm, do not invent a row.
- [ ] pnpm check, pnpm build, pnpm test all green on the committed tree.

## Verification

`pnpm check` and `pnpm test` pass on the committed tree. `evaluateFormula(\"now()\").value` is a number and two sequential calls are non-decreasing (epoch-ms monotonic, equality within a millisecond allowed); `'row-' + now()` reads a string starting `row-`; `now(1)` throws `now() takes 0 arguments`; `parseFormula(\"now()\")` succeeds with no element. The executor test clicks an `attributable` element twice and asserts two distinct ids both prefixed `row-`. docs.html lists `now` in the grammar, the number-returning list, and has a table row plus a paragraph documenting the same-millisecond collision and the `id=\"row-{id}\"` prefix requirement.

## Prohibited Patterns

- Do not reopen the Temporal park: no date arithmetic, no date vocabulary, no conversions, no overloading + to mean date maths. now() returns a plain number next to count().
- No internal engine counter that hands out incrementing ids — the value must come from the clock (epoch ms), never from stored per-evaluation state, or parse-time validation would not be stable.
- No arguments, no selector, no element set — now() is arity 0; count() owns sets.
- Do not switch to sum()+1, max()+1, or count()-derived schemes: the task exists because they collide or explode.
- Do not add a formula enumeration to README.md or reference.html that duplicates docs.html — README is the hook and reference defers expressions to the docs.
