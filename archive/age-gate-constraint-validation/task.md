---
wait_human_start: false
wait_human_merge: false
dependencies: [remove-is-guard-verb]
---

# Task: Rewrite the age-gate example with constraint validation

## Metadata

- **Complexity:** Low
- **Priority:** Medium
- **Status:** Ready for Handoff

## Context

The age-gate example is the only user of the `is()` guard verb, and it demonstrates the bug the removal predicts (raise to 18, panel shows; drop to 17, panel stays — the `if` has no `else`). `validatable` with `min="18"` does the same job through constraint validation, so the example loses nothing. Because `validatable`'s `validate()` calls `reportValidity()`, which pops a browser tooltip on every keystroke while invalid, the trigger must be `on-change`, not `on-input`.

## Requirements

- [ ] site/examples.html age-gate section (lines ~405–445): the live input becomes `implements="validatable" min="18"` with `on-change="this.validate() && #consent.show()"`; drop `implements="modifiable"`.
- [ ] Rewrite the example note to say `validate()` is the guard and the `min` attribute carries the rule (no more `is({op: '>=', value: 18})`).
- [ ] Update the copyable code block to match the new live markup exactly.
- [ ] tests/site-smoke.test.ts age-gate block (lines ~274–279): dispatch a `change` event (not `input`) on #age and update the assertion message to reference `validate()` instead of `is()`.
- [ ] Confirm `validatable`'s `validate()` does not pop a per-keystroke tooltip on this page — the `on-change` trigger satisfies this; keep `on-change`, never `on-input`.

## Verification

`pnpm check`, `pnpm test` and `pnpm build` pass on the committed tree, including the site smoke test. The repo-wide guard check returns nothing outside node_modules/dist: `grep -rn "\\.is(\\|is({" --include=*.ts --include=*.md --include=*.html --include=*.js .`. On the deployed page the gate behaves: entering 18 and committing shows the consent panel; below 18 it stays hidden, and no validation tooltip flashes on every keystroke.

## Prohibited Patterns

- Do not touch `validatable` itself, the parser, `&&`/`||` semantics, or any other behaviour.
- Do not keep `on-input` — it would pop a browser validation tooltip on every keystroke via `reportValidity()`.
- Do not edit README.md or site/reference.html / site/docs.html in this task — those are the docs task's scope.
