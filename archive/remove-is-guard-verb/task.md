---
wait_human_start: false
wait_human_merge: false
dependencies: []
---

# Task: Remove the `is()` guard verb from modifiable

## Metadata

- **Complexity:** Low
- **Priority:** High
- **Status:** Ready for Handoff

## Context

The age-gate example is the only user of `is()` in the repo, and it has the bug this removal predicts: raise the age to 18, the panel shows; drop it back to 17, the panel stays (the `if` has no `else`). `is({op, value})` was added in 1bd19ba to replace the `condition` implementation. Decision: the DSL says *what happens*, not *whether*. Whether something should happen is a behaviour's judgement — `validate()` knows what invalid means, `revealable` knows whether it's open — and a bare comparison in markup owns nothing and knows nothing. `is()` is the condition implementation with a shorter name. Remove it.

## Requirements

- [ ] Delete the `is` signature from the verbs map in registry/behaviors/modifiable/modifiable.ts (the `is: { op: ..., value: ... }` entry).
- [ ] Delete the `is` verb body from the implementation factory in modifiable.ts.
- [ ] Delete `compare`, `rawValue` and the `Op` type from modifiable.ts if nothing else in the file uses them (check first; registry/utils/formula.ts has its own private `rawValue`).
- [ ] Delete the three `is()` tests from registry/behaviors/modifiable/modifiable.test.ts (the tests around line 351–390).
- [ ] Touch nothing else in modifiable and no other file: parser, `&&`/`||` semantics, `validatable` and all other implementations stay untouched.

## Verification

`pnpm check` and `pnpm test` pass on the committed tree. `rg -n "\\.is\\(|is\\{" registry/` returns nothing outside node_modules/dist.

## Prohibited Patterns

- Do not touch the parser, executor, `&&`/`||` semantics, `validatable`, or any other modifiable verb/behaviour.
- Do not edit README.md or any site/*.html in this task — docs and the age-gate example are separate tasks that depend on this one.
