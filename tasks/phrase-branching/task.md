---
wait_human_start: false
wait_human_merge: false
dependencies: []
---

# Task: `&&`/`||` cross-receiver continuation operators

## Metadata

- **Complexity:** Medium
- **Priority:** Medium
- **Status:** Ready for Handoff

## Context

Validation failure is a dead end today: a guard's `preventDefault()` aborts the chain (executor.ts:116) and nothing can react declaratively — sibling `;` phrases run regardless, and `condition` cannot observe validity. Explored and rejected: an `else` keyword (ugly, breaks the grammar shape) and a per-implementation config like `validatable-error` (works but per-impl, and `validate` is the only guard verb). Settled design: add `&&` and `||` as cross-receiver continuation operators between units. `.` stays same-receiver, sequential, abortable; `&&` runs the next unit only if the previous one completed, `||` only if the previous one was aborted by a guard; both may switch receivers. This makes `on-submit="this.validate().send() || '#validate-alert.show()'"` (failure branch) and `on-change="this.validate() && '#hint.show()'"` (success branch to another element) expressible in markup with zero JS/CSS. Division of labour: sync guard-aborts belong to the phrase (`||`); async moments stay with the implementation (`requestable-after`/`requestable-error`), matching README §"Why" on continuation phrases from an implementation's own config. Remaining micro-decisions encoded as requirements below (no operator mixing, guard-only `||`, modifiers phrase-wide); review them before starting.

## Requirements

- [ ] Parser accepts `&&` and `||` as top-level unit separators: `phrase := [key ':'] unit (('&&' | '||') unit)*` with `unit := ref ('.' call)+ ('.' modifier)*`. They are recognized only outside string literals and outside arg parens/braces (an `&&`/`||` inside a quoted string or an argument is not an operator).
- [ ] Mixing `&&` and `||` within one phrase is a parse error reported like other invalid phrases (no precedence question arises).
- [ ] `&&` semantics: each unit runs only if the preceding unit completed; an aborted unit stops the remaining `&&` units of the phrase.
- [ ] `||` semantics: each unit runs only if the preceding unit was aborted by a guard's `preventDefault()`; the first unit that completes stops the phrase, so later `||` fallbacks do not run.
- [ ] Unhandled verbs, thrown verbs, failed argument resolution and missing receivers behave as today (logged once, phrase stops) and do NOT trigger `||` fallbacks; they also stop `&&` continuation. `||` fires only on a guard abort.
- [ ] `once()` / `debounce()` / `throttle()` remain phrase-wide and work with `&&`/`||`; `once()` is consumed only when the phrase completes without an abort (a guard-aborted phrase whose `||` fallback ran does not spend it). Keyed phrases (`enter: ...`) work with the operators.
- [ ] `;` phrases remain independent: a `;`-separated sibling phrase runs whether or not the previous phrase aborted.
- [ ] `.` remains same-receiver, sequential and abortable; `&&`/`||` may switch receivers; `this` and `#id` are valid receivers in any unit.
- [ ] No implementation changes: `validatable`, `requestable` and the other implementations are untouched; async moments remain implementation-owned (`requestable-after`, `requestable-error`).
- [ ] README updated: reference grammar gains `&&`/`||`; the validation-failure line in the failure-path walkthrough shows the `||` branch; a Why note records why the two operators exist and why `||` is guard-only.
- [ ] The site demo order/signup form gains a declarative `||` validation-failure branch (no JS, no CSS), and the site smoke test exercises it.

## Verification

`pnpm check` and `pnpm test` pass on the committed tree. New tests prove each branch: (a) `validate().send() || '#alert.show()'` on an invalid form dispatches the alert and does not run send; (b) the same phrase on a valid form runs send and does not dispatch the alert; (c) `validate() && '#hint.show()'` dispatches the hint only when validation completes; (d) a phrase mixing `&&` and `||` logs a parse error; (e) a thrown/unhandled verb does not trigger `||`; (f) `once()` is not spent when a guard aborts even though the `||` fallback ran; (g) a keyed `enter:` phrase works with `&&`/`||`. The site smoke test asserts the demo's validation-failure alert appears on invalid submit and not on valid submit.

## Prohibited Patterns

- Do not introduce an `else` keyword or any new keyword; do not change the semantics of `;` or `.` (`.` stays same-receiver and abortable).
- Do not implement validation-failure handling as a per-implementation config (e.g. `validatable-error`): the sync guard-abort belongs to the phrase, async moments belong to implementations.
- Do not relax the no-mixing rule: allowing `&&` and `||` in one phrase reopens precedence/associativity questions the design explicitly avoids.
- Do not make verbs async or await promises; the async gap stays a named implementation attribute.
- Do not add new implementation files under registry/behaviors.
