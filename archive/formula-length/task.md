---
wait_human_start: false
wait_human_merge: false
dependencies: []
---

# Task: `length()` — the character count of a string, as a formula function

## Metadata

- **Complexity:** Low
- **Priority:** Medium
- **Status:** Ready for Handoff

## Context

The live character counter under a bounded text field — "42 of 200", turning amber near the limit — is one of the most common pieces of form feedback on the web, and nothing in the expression language can produce it. `maxlength` enforces the bound silently; the counter is the only thing that tells the user why their typing stopped.

Rule 10 (`README.md:183`) fixes the five properties readable off a ref (plus `height` and `width` in expressions only) and forbids chaining past them, so `this.value.length` is not and will not be legal. The read belongs where `sum`, `count` and `replace` live: a formula function, `length(this.value)`.

Two rulings, both made:

- **Strings only.** `length()` takes exactly one argument and it must read as a string. It does not count elements — `count()` owns that meaning — and it does not accept a number or boolean.
- **No coercion.** `length(this.value)` on a `type="number"` or `type="range"` input errors, because the ref reads a number there. That is the `.value` rule doing its job, not a gap; there is no use for the digit count of a number, and coercing would make the same phrase mean different things on different fields. The error must say plainly what happened so the author sees why one field works and another does not.

`requireString` (`registry/utils/formula.ts:477`) and the `not-a-string` reason already exist for `replace` and do exactly this. `length` reuses both.

## Requirements

- [ ] `registry/utils/formula.ts`: a `case "length":` in the function switch beside `replace` (~l.390): `requireArity(name, args.length, 1)`, then `return requireString(args[0]!, functionMeta(formula, name), context.dryRun).length`. Returns a number. Under `dryRun`, `requireString` already returns `""`, so the dry result is `0`.
- [ ] `length` is registered wherever the parser learns function names, so `length(…)` is accepted at parse time and an unknown name still fails at parse time (`formula.test.ts:829` pins that behaviour; do not weaken it). Find the list rather than guessing where it is.
- [ ] `FormulaError` `not-a-string` message (`formula.ts:52`) currently says "needs a string as its first argument". `length` has only one argument, so that wording is still true; leave it unless it reads oddly in the test output, in which case make it "needs a string argument" for arity-1 functions and keep "first argument" for `replace`. Either way the message still ends with "— see the .value rule".
- [ ] `String.prototype.length` counts UTF-16 code units, which is what `maxlength` counts too — so the counter and the platform bound agree on emoji and astral characters. State this in the README row; do not "fix" it with a grapheme or code-point count.
- [ ] `registry/utils/formula.test.ts`: 1) `length('hello')` is `5`; `length('')` is `0` (an empty string literal is a string, not an empty-operand error — mirror the `replace('')` test at l.746). 2) `length('héllo 👋')` is `8` (the wave is two code units) — pins the code-unit rule. 3) `length(this.value)` with `this` a text input holding `"abc"` is `3`; with a `textarea` holding `"a\nb"` is `3`. 4) `length(this.value)` with `this` a `type="number"` input holding `12` throws `FormulaError` with `reason === "not-a-string"` and a message containing `length()` and `read as a number`. 5) `length(#tick.checked)` throws `not-a-string` with `read as a boolean`. 6) `length(5)` — a number literal — throws `not-a-string`. 7) `length()` and `length('a', 'b')` fail arity, same shape as the existing `round()` arity tests. 8) `length(this.value) + ' of 200'` is `"3 of 200"` (a number joined to a string literal — typed `+`); `200 - length(this.value)` is `197`. 9) Dry run: `parseFormula("length(this.value)")` succeeds with no element present.
- [ ] Executor path, one test through `attach()`: `<textarea id="bio" maxlength="200" on-input="#bio-count.set(length(this.value) + ' of 200')">` and `<output id="bio-count" implements="modifiable">`; set the value to a 42-character string, dispatch `input`; the output reads `42 of 200`.
- [ ] `pnpm check`, `pnpm build`, `pnpm test` green.
- [ ] `README.md` reference grammar (`## Appendix: reference grammar` and the inline `function :=` line at ~l.203): add `length` to the alternatives.
- [ ] `README.md` expression table (~l.208–216): a `length` row after `replace`: example `length(this.value)`, meaning: the character count of a string as a number, counted in UTF-16 code units — the same unit `maxlength` uses, so a counter and the platform bound always agree; the argument must read as a string, so on a `type="number"` field it is a `not-a-string` error, never a digit count. Also add `length` to the "return numbers" list in the Typed `+` row.
- [ ] `README.md`: a short worked example in the expressions section, after the mask-on-input paragraph (~l.224) — the counter above, plus the amber-at-the-edge variant done in the author's CSS from an attribute, e.g. `on-input="#bio-count.set(length(this.value) + ' of 200'); this.setAttr({name: 'data-remaining', value: '' + (200 - length(this.value))})"` with `implements="attributable"` and a `[data-remaining^="1"]`-style note left to the author. Check the `setAttr` value slot is `"string"` and use the `'' +` join, as the `&` example does (`13c5321`).
- [ ] `site/docs.html:330` grammar line and the `:343` table: mirror the README grammar and the new row.
- [ ] `README.md` `## API reference` — nothing to add unless the formula function list is enumerated there; check with `grep -n "replace" README.md` past l.864.

## Verification

`pnpm check`, `pnpm build`, `pnpm test` all green on the committed tree. `length('hello')` is 5, `length('héllo 👋')` is 8 (UTF-16 code units, the `maxlength` unit), a text input's value and a textarea's `"a\nb"` both count, a number/boolean operand is a `FormulaError` with `reason === "not-a-string"` naming `length()` and how the operand read, arity failures match `round()`'s, the number-to-string join `length(this.value) + ' of 200'` reads `"3 of 200"`, `200 - length(this.value)` is 197, and `parseFormula("length(this.value)")` passes with no element present. The executor test drives `<textarea id="bio" maxlength="200" on-input="#bio-count.set(length(this.value) + ' of 200')">` through `attach()` with a 42-character value and `input`; `#bio-count` reads `42 of 200`.

## Prohibited Patterns

- `this.value.length` or any property chaining on a ref. Rule 10 stands.
- `length()` over a selector, array or element set. `count()` is that.
- Coercing numbers or booleans. The error is the feature.
- Grapheme or code-point counting.
- A `remaining()` or `maxlength`-aware helper. `200 - length(this.value)` is the expression; reading `this.maxlength` would be a seventh ref property and is not on the table.
