---
wait_human_start: false
wait_human_merge: false
dependencies: []
---

# Task: dirtyable: events, not a class; the platform default as baseline

## Metadata

- **Complexity:** Medium
- **Priority:** High
- **Status:** Ready for Handoff

## Context

dirtyable (registry/behaviors/dirtyable/dirtyable.ts) is the last implementation that paints its own effect: it toggles a `.is-dirty` class no stylesheet declares and no doc explains, while every other implementation says *what happened* and the trigger attribute says what it looks like (e.g. copyable → on-copy). Its baseline is `el.value` snapshotted at connect in the closure — a fourth notion of "original value" beside the platform's defaultValue / defaultChecked / defaultSelected, which disagrees with them whenever the value is written between parse and connect. It also re-renders only on `input` and interaction events, so storable's restore (which fires its own `restore` event by design) reads as clean until the next keystroke; README documents the on-restore="this.markClean()" workaround that should not be needed. The rework: dirtyable owns one decision — is the element's current state different from its default — and reports the *transitions* of that decision as `dirty` / `clean` ImplementationEvents, writing nothing to the element. Baseline is the platform default by element kind (select: any option selected !== defaultSelected; checkbox/radio: checked !== defaultChecked; every other input/textarea/output: value !== defaultValue; defaultValue is live, so a script writing the value attribute moves the baseline). Evaluation happens on input or change (config `dirty-on`, default input), on interaction events, and on storable's restore event. markClean() commits the current state as the new default and re-evaluates. Baseline is d0311d7 (origin/main), 427/427 tests; pnpm check / pnpm test / pnpm build must stay clean. One commit. Out of scope: everything else in the queue; the host and executor are untouched.

## Requirements

- [ ] When an element's state starts differing from its platform default, the element fires a `dirty` ImplementationEvent; when it stops differing having been dirty, it fires `clean`. Nothing fires while the reported state does not change; the initial evaluation at connect sets the boolean and fires nothing.
- [ ] `dirty` and `clean` are declared in `events` of defineImplementation, so `on-dirty` / `on-clean` are recognised trigger attributes and the implementation writes nothing to the element (no class, no attribute).
- [ ] The baseline is the platform's default by element kind: `<select>` (single or multiple) is dirty when any option's `selected !== defaultSelected`; `<input type=checkbox>/<input type=radio>` when `checked !== defaultChecked`; every other `<input>`, `<textarea>` and `<output>` when `value !== defaultValue`. A file input with a value reads as dirty. `defaultValue` is live (a script writing the value attribute moves the baseline), stated in one sentence in the docs.
- [ ] Evaluation happens on `input` or `change` chosen by config `dirty-on: "input" | "change" | undefined` (default `input`, only the one listener the mode names), on interaction events (verbs such as modifiable's set/inc that change the value without a native event), and on the `restore` ImplementationEvent storable dispatches on the element, so a restore that writes a differing value flips the element dirty with no keystroke.
- [ ] `markClean()` commits the current state as the new default (by the same three branches: each option's defaultSelected = selected, or defaultChecked = checked, or defaultValue = value) and re-evaluates; a dirty→clean transition fires `clean`. It is the only verb.
- [ ] Docs reflect the new shape: the implementations table, the no-state example (closure holds one boolean, the default is the platform's), the storable paragraph (restore now seen directly), and the +5 trace; site/docs.html, site/reference.html and site/styles.css are updated, site demos use on-dirty/on-clean with a `[data-dirty]` rule, and no `is-dirty` use remains anywhere in site/.
- [ ] Tests are rewritten for the listed cases (text input transitions; dirty-on="change"; checkbox; radio group; single and multi select; scripted defaultValue; restore; markClean twice; no class ever written; authored-dirty connect with no event at connect then the first flip fires; file input). The total test count must not go down, and pnpm check, pnpm test and pnpm build stay clean.

## Verification

On the committed tree, `pnpm check`, `pnpm test` and `pnpm build` all pass with the test count not below 427, and `rg -n "is-dirty" site/` returns nothing.

## Prohibited Patterns

- No changes to the host (registry/behaviors/interactable-host.ts) or executor (registry/interactable/executor.ts) — the restore subscription must reuse the existing on* binding mechanism.
- The implementation must never write a class or attribute to the element (no is-dirty, no data-dirty, no dirty-state).
- No connect-time closure baseline of `el.value` — the baseline is the platform's defaultValue / defaultChecked / defaultSelected, with no fourth notion.
- Do not dispatch dirty/clean when the reported state does not change, and do not fire anything at connect; only transitions fire.
