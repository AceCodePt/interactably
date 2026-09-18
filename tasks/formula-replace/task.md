---
wait_human_start: false
wait_human_merge: false
dependencies: [formula-this]
---

# Task: `replace()` is a formula function

## Metadata

- **Complexity:** Low
- **Priority:** Medium
- **Status:** Ready for Handoff

## Context

The transformation `paste-transform` performs — take a string, a regex, a replacement, return a string — has no receiver and touches no DOM. That is the shape of `sum()`, `count()`, `floor()`: a function in the expression language, not a verb. The formula already returns strings (typed `+`, `README.md:204`), so adding a string function widens nothing in kind. `applyFunction` is `formula.ts:299-327`.

Step 2 of 3 toward inline expressions. `paste-transform` itself is deleted in `task-pastable.md`, not here.

**Two traps found while reading source, both must be handled:**

1. **`parseString` (`formula.ts:263-283`) eats every backslash.** `'\D'` parses to `"D"`. A regex argument written the obvious way silently matches the letter D. The trigger DSL's `STRING` (`parser.ts:38`) has no escapes at all, so `'\D'` passes through raw there — the two languages disagree today, and inline expressions will have to pick one. Pick now, compatibly with both: backslash escapes **only** the quote character and itself (`\'`, `\\`); any other `\x` is kept verbatim including the backslash. `'\D'` is the three characters `\D`. `'it\'s'` is `it's`.
2. **`readValue` (`implementation-utils.ts:22-29`) returns a number when the text parses.** `#zip.value` for `"05"` is `5`; `String(5)` is `"5"`; a leading zero is gone before `replace` ever sees it. `replace` must not silently accept a number as its first argument.

## Requirements

- [ ] applyFunction gains `case "replace"`: arity exactly 3; arg 1 **must be a string** — a number or boolean operand is a `FormulaError` with a new `Reason` `"not-a-string"` and message `replace() needs a string as its first argument; #zip.value read as a number — see the .value rule` (origin from the operand, as `requireNumber` does); arg 2 is the pattern, compiled `new RegExp(pattern, "g")` — always global, an invalid pattern is `FormulaError` reason `"invalid-pattern"` naming the pattern; arg 3 is the replacement, passed to `String.prototype.replace` unchanged so `$1`/`$&` work as the platform defines them. Returns a string.
- [ ] parseString escape rule tightened as in Context. Existing formula tests that relied on `\n`-style escapes are updated to the new rule, and the rule is pinned: `'\D'` yields `\D`; `'\''` yields `'`; `'\\'` yields `\`.
- [ ] Empty-string first argument is **not** an empty-operand error (that rule is for arithmetic): `replace('', '\D', '')` is `""`. Pinned.
- [ ] formula.test.ts: `replace('a1b2', '\D', '')` → `"12"`; global: `replace('1-2-3', '-', '')` → `"123"`; `$1` group reference works; arity 2 and 4 are errors; number first argument is the not-a-string error naming the origin; invalid pattern error; `replace(this.value, …)` reads the source (from `formula-this`); nesting: `'tel:' + replace(#phone.value, '\D', '')` when `#phone` holds a non-numeric-looking string.
- [ ] README formula section: `replace` added to the function list at `README.md:204` ("`min`/`max`/… return numbers; `replace` returns a string"); one construct-table row: `replace(this.value, '\D', '')` — "regex replace, always global; the value must read as a string"; the string-escape rule stated in one sentence next to the string literal description; the `.value`-is-a-number sharp edge (`README.md:210`) gains the second symptom: a numeric-looking value loses its leading zeros and cannot be passed to `replace`. `site/docs.html` mirrors.

## Verification

`pnpm check && pnpm build && pnpm test`; `rg -n '"replace"' registry/utils/formula.ts` shows one case; `rg -n "not-a-string|invalid-pattern" registry/utils/formula.ts` shows both reasons.

## Prohibited Patterns

- Do not delete or modify `paste-transform` here.
- Do not add a `.text` / raw-string read property to work around trap 2 — the `.value` coercion question is decided in `task-inline-expressions.md`; here `replace` simply refuses a number and says why.
- Do not touch `parser.ts`.
- No code comments beyond the brief's.
