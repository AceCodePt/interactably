---
wait_human_start: false
wait_human_merge: false
dependencies: [expressions-inline]
---

# Task: Remove `inc()` / `dec()`; expose `.min`, `.max`, `.step`

## Metadata

- **Complexity:** Medium
- **Priority:** Medium
- **Status:** Ready for Handoff

## Context

`inc()` and `dec()` (`modifiable.ts:58-59`) are `set(this.value + n)` with three things baked in: a default `n` from `modifiable-step` or `1`, a clamp to the input's `min`/`max` (`modifiable.ts:45-48`), and a tolerant number read through `valueOf` (NaN → 0). Once expressions are verb arguments (expressions-inline), the addition is something the author writes, not something a verb does — the same reason `compute()` died. And the verb was never saving an id: a receiver has to have an id to be targeted by another element anyway, and the self case needs none (`this.set(this.value + 1)` inside a template).

Ruling (2026-09-17):
- `inc()`, `dec()` and `modifiable-step` are deleted. The author writes the increment: `#qty.set(#qty.value + 1)`, `#qty.set(#qty.value + #qty.step)`, `this.set(this.value - 1)`.
- `set()` does not clamp. It writes what it was asked to write. An out-of-range value is a real state the platform already models (`:out-of-range`, `validity.rangeOverflow`) and `validatable` is where it is reported. Clamping is something the author says: `#qty.set(min(#qty.max, #qty.value + 1))`. Same principle as the `.value` type ruling — the library does not edit intent.
- `.min`, `.max`, `.step` become readable properties, in both the DSL `read` kind and the expression grammar (one language, one reader — the `readValue(el, property)` contract from expressions-inline). They are typed by the element like `.value`: on `type="number"`/`range` they are numbers; elsewhere the string as written (date bounds are strings; date arithmetic stays parked). Absent `min`/`max` reads the empty string, which in an expression is the existing empty-operand error naming the reference. Absent `step` on `type="number"`/`range` reads `1` — the platform's declared default, not a guess (`el.step` returns `""` for the content attribute, so the reader supplies the default itself). On any other element absent `step` is the empty string like the others.
- `valueOf` and `toNumber` are deleted (their only callers were `inc`/`dec`; the "a verb tolerates the unreadable" clause goes with them). This closes the ripple recorded in expressions-inline.
- `set`, `clear`, `reset`, `compute` stay. `modifiable`'s `config` becomes empty.

## Requirements

- [ ] modifiable.ts: remove `inc`, `dec`, the `step` config key, `bound`, `clamp`, `numberArg`, and the `toNumber`/`valueOf` imports. `set`/`clear`/`reset` unchanged. Confirm `defineImplementation` accepts `config: {}` (or omit the key) without a runtime or type complaint.
- [ ] implementation-utils.ts: delete `toNumber` and `valueOf`; `src/core.ts` export list updated. `rg -n "valueOf\(|toNumber\(" registry/ src/` returns nothing.
- [ ] parser.ts `READABLE_PROPERTIES` gains `min`, `max`, `step`. `executor.ts` `read` resolution for them goes through the typed reader (same path `.value` uses after expressions-inline), not the raw IDL property.
- [ ] The typed reader handles `min`/`max`/`step` per the ruling: numeric read on `type="number"`/`range` (`Number(el.min)` when non-empty; `NaN` is not-a-number naming the reference), `step` default `1` on those two types when the attribute is empty, string elsewhere, empty string when absent.
- [ ] Expression grammar: `reference := ('#' id | 'this') '.' ('value' | 'checked' | 'min' | 'max' | 'step' | 'height' | 'width')`.
- [ ] modifiable.test.ts: `inc`/`dec` tests removed (not rewritten as `set` tests — `set` is already covered). One test pins that `set(999)` on `<input type="number" max="10">` writes `999` and the input reports `validity.rangeOverflow`.
- [ ] formula.test.ts: `#q.min`/`#q.max`/`#q.step` on a number input are numbers; `min(#q.max, #q.value + 1)` clamps; absent `max` is the empty error naming `#q.max`; absent `step` on a number input is `1`; `step` on a date input is the string; `.step` on a `<span>` is the empty string.
- [ ] parser.test.ts / executor.test.ts: `#q.step` as a `read` argument resolves to a number on a number input; `.min` on a `<textarea>` (no such attribute) resolves to `""`, not a 'has no min property' error — the `in target` guard does not fire for these; the typed reader owns the answer.
- [ ] price-calculator.test.ts: the `+`/`−`/`+5` buttons rewritten to `set(#qty.value + …)`; the `+5` trace assertion updated.
- [ ] `pnpm build && pnpm test` green; baseline count noted in the PR.
- [ ] Quick start (`README.md:89,100`): `#qty.inc()` → `#qty.set(#qty.value + 1)`; the sentence "the input clamps to `max`" is deleted, not softened.
- [ ] Scalar-arg example (`README.md:157`) `#qty.inc(5)` → `#qty.set(#qty.value + 5)`.
- [ ] Line-item example (`README.md:713-715`) and the `+5` trace (`README.md:735`): rewritten; the trace no longer mentions clamping or `"string | number | undefined"`.
- [ ] Implementations table row (`README.md:298`): verbs `set`, `clear`, `reset`, `compute`; config `—`; description loses "with clamping" and the `inc`/`dec` clause.
- [ ] Argument-kinds table (property reads): `value`, `checked`, `min`, `max`, `step`, with one line — a read has the type the element declares; absent `min`/`max` is empty; absent `step` on a number input is `1`.
- [ ] `modifiable-step` is the canonical config example at `README.md:401,442,499,518` — replace with `revealable-open` (already used at l.514) or `formattable-format`; `rg -c modifiable-step README.md site/` returns 0.
- [ ] Helpers table (`README.md:886`) and "One reader" paragraph (`README.md:566`): `valueOf`/`toNumber` rows deleted; the tolerant-verb clause deleted.
- [ ] Site: `docs.html` mirrors each README change; `examples.html` and `index.html` calculator buttons rewritten; `reference.html` modifiable verb tags. `rg -n "\.inc\(|\.dec\(" README.md site/` returns nothing.
- [ ] One new sharp-edge line in the README: "`set()` does not clamp. Say it: `min(#q.max, …)`."

## Verification

`pnpm build && pnpm test` and `pnpm check` green. `rg -n "\.inc\(|\.dec\(|modifiable-step|valueOf\(|toNumber\(" README.md site/ registry/ src/` prints nothing.

## Prohibited Patterns

- No clamping inside `set()`, and no `set()` option or config that turns clamping on.
- No `inc`/`dec` kept as aliases, deprecated or otherwise.
- No `Number(text)` on `.min`/`.max`/`.step` for non-number elements; the type follows the element.
- No silent `±Infinity` for an absent bound.
- No `step` default outside `type="number"`/`range`.
- Do not touch `formattable`, `validatable`, or `dirtyable` — `set()` reaching `dirtyable` is unchanged.
