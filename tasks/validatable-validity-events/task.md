---
wait_human_start: false
wait_human_merge: false
dependencies: []
---

# Task: validatable announces validity as events

## Metadata

- **Complexity:** Medium
- **Priority:** High
- **Status:** Ready for Handoff

## Context

`validatable` today is four lines: one verb, `validate()`, calling `reportValidity()` and `preventDefault()`-ing on failure. It declares no events. Conditionality is expressed by `&&` stopping the chain, as `site/examples/age-gate.html` does with `on-change="this.validate() && #consent.show()"`. That covers "act when I ask". It does not cover "tell me when this changed", which is what a form that gates later steps on earlier ones needs, and what a field that shows a message underneath it needs.

The platform half is missing. `invalid` fires on a submittable element when it is checked and fails. There is no corresponding `valid` event — `w3c/html#1696`, "Add a valid event to input element constraint validation", is open and unresolved. `invalid` also does not bubble, and on a form, `checkValidity()` fires it on each failing control but never on the form element itself. So a field can announce that it broke and never that it recovered, and a form cannot hear its children at all without capture-phase listeners — which is why form-level events are needed and why capture-phase listening is not the mechanism we expose.

This task supplies the missing halves, following `dirtyable` exactly: a stored last state, an `evaluate()` that returns early when nothing changed, and a `*-on` config choosing the trigger.

### The events

Four, on both fields and forms:
- **`valid`** and **`invalid`** fire on every evaluation, reflecting the current state. Aggressive; use when continuous state is wanted.
- **`user-valid`** and **`user-invalid`** fire only on a transition, and only once the control has been interacted with. Quiet; this is what a stepper and a message toggle want.

The `user-` prefix is deliberately CSS's: `:user-valid` and `:user-invalid` apply only after meaningful interaction, which is why a `required` empty field does not scold someone on page load. Our `user-` events mean **both** conditions — touched at least once, **and** flipped. This matters because this library changes values programmatically: `storable`'s restore can install an invalid value and `renderable` can stamp a `required` empty input, and neither should fire a `user-` event at someone who has not engaged.

The native `invalid` is left exactly as it is. Our `invalid` is dispatched on the element `validatable` is attached to, which for a form is the form itself — where the native event never fires — so there is no collision there. On a field, our `invalid` and the native `invalid` share a name on the same element; this is the same deliberate sharing as `copyable`'s `copy`, and the docs must record it the same way, including the note that if it ever bites, the fix is a rename, not a redesign.

Both phrases an author writes are idempotent — showing a shown message, hiding a hidden one, enabling an enabled radio. So an extra fire is invisible and a missed fire is the only real failure. Err toward firing.

### Mechanics

Mirror `dirtyable`:
- `checkValidity()`, never `reportValidity()`, for evaluation — it validates silently with no browser bubbles. Note in the docs that it still fires the native `invalid` on each failing control; that is the platform's behaviour and is not suppressed.
- `validatable-on: 'input' | 'change' | undefined`, defaulting to `input` as `dirtyable` does, so an author can choose per-keystroke or on-commit.
- Subscribe `onInteraction`, `onRestore` and `onInput`/`onChange` exactly as `dirtyable` does, plus `attributeChangedCallback` re-evaluating when a constraint attribute changes (`required`, `min`, `max`, `pattern`, `minlength`, `maxlength`, `step`, `type`, `value`, `checked`) — a constraint change can flip validity with no interaction at all.
- Track `touched` separately from validity: set it on first interaction, and never from a programmatic change. `user-` events fire only when `touched` is true.
- `tags` gains `fieldset` if `fieldset` supports constraint validation. Verified: `HTMLFieldSetElement` has `checkValidity()`/`reportValidity()`, but `willValidate` is `false` — it is barred from constraint validation, so it always returns `true` and does not aggregate its children. `tags` therefore stays `form`, `input`, `select`, `textarea`, and the docs note that a step must be a form.

`validate()` keeps its current behaviour unchanged: `reportValidity()` plus `preventDefault()`. It is the "act now and show the user" path; the events are the "tell me when it changed" path. Both stay.

### Form-level and field-level are both needed

A field's events drive its own message. A form's events drive anything that gates on the whole step — the form-level pair is the only way to ask "is all of this valid", since `invalid` does not bubble. Both must work; a test must cover a form whose validity flips because one of several children changed.

## Requirements

- [ ] `validatable` declares `valid`, `invalid`, `user-valid`, `user-invalid`, none carrying values.
- [ ] The aggressive pair fires on every evaluation; the `user-` pair fires only on a transition and only after interaction, with tests covering both, including a restore-installed invalid value firing `invalid` but **not** `user-invalid`.
- [ ] A form's events reflect all its controls; a test covers the flip driven by one of several children.
- [ ] `validatable-on` chooses `input` or `change`.
- [ ] A constraint-attribute change re-evaluates.
- [ ] `validate()` is unchanged and `site/examples/age-gate.html` still works untouched.
- [ ] The docs record: the missing platform `valid` event and `w3c/html#1696`; that `checkValidity()` still fires native `invalid`; the deliberate name sharing on fields; and the `user-` semantics.
- [ ] The four homes stay in parity.
- [ ] `pnpm run build` then `pnpm test` and `pnpm run check` pass.

## Verification

On the committed tree: `pnpm run build` then `pnpm test` and `pnpm run check` all pass. Tests exercise: `valid`/`invalid` firing on every evaluation; `user-valid`/`user-invalid` firing only on a transition and only after interaction, and **not** for a `storable` restore-installed invalid value; a form's events flipping when one of several children changes; `validatable-on: 'change'` deferring to change while the default fires on input; a constraint-attribute change re-evaluating; and `validate()` still calling `reportValidity()` and `preventDefault()`. `site/examples/age-gate.html` loads and behaves unchanged. The four homes (`site/docs.html`, `site/reference.html`, `README.md`, `site/index.html`) stay in parity under the site-smoke test.

## Prohibited Patterns

- Do not suppress or re-dispatch the native `invalid` event or its bubbles.
- Do not expose `checkValidity()` as a verb, and do not add a quiet variant of `validate()`.
- No `setCustomValidity` or any custom-message API.
- Do not add capture-phase listening as a public mechanism.
- Do not change `validate()`'s behaviour.
- Do not add `fieldset` to `tags` (verified barred from constraint validation; it does not aggregate its children).
- No `/tmp` scratch work; any scratch lives in `<repo>/scratch/` and is deleted before finishing.
- No code comments unless requested.
