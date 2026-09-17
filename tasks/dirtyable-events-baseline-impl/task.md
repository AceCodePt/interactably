---
wait_human_start: false
wait_human_merge: false
dependencies: [dirtyable-events-baseline]
---

# Task: Rework dirtyable to dirty/clean events and the platform-default baseline (implementation + tests + docs)

## Metadata

- **Complexity:** Medium
- **Priority:** High
- **Status:** Ready for Handoff

## Context

Vertical slice for the dirtyable rework specced in dirtyable-events-baseline: rewrite registry/behaviors/dirtyable/dirtyable.ts and its test, update the two test files that assert the old `.is-dirty` class, and update README.md plus the site (docs.html, reference.html, styles.css, index.html, examples.html) so no `is-dirty` use remains.

## Requirements

- [ ] dirtyable.ts declares config `{ "dirty-on": "'input' | 'change' | undefined" }` (attribute dirtyable-dirty-on, default input), verbs `{ markClean: "undefined" }`, and events `["dirty", "clean"]`; the closure holds exactly one boolean, the last reported dirtiness, initialised at connect by a three-branch isDirty() over the platform defaults and firing nothing.
- [ ] Evaluation is bound as onInteraction and onRestore plus exactly one of onInput (default) or onChange (when dirtyable-dirty-on="change"); a comment states that restore is subscribed through the host's on* binding (no manual addEventListener/removal).
- [ ] markClean() commits the current state as the new default by the same three branches (per-option defaultSelected = selected; defaultChecked = checked; defaultValue = value) and re-evaluates, firing `clean` on a dirty→clean transition; a second markClean() fires nothing.
- [ ] dirtyable.test.ts is rewritten with at least 5 tests covering: text input char/delete/two-chars transitions (exactly one dirty, one clean, one dirty); dirty-on="change" (input silent, change fires); checkbox toggle both ways with defaultChecked as baseline; radio group firing dirty on the selected element only; single and multi select (multi dirty when only the second option differs from default); scripted defaultValue re-evaluated on next input; restore event with no input; markClean firing clean once then nothing; classList.length unchanged throughout; authored-dirty connect (no event at connect, first flip fires clean); file input dirty when a value is set.
- [ ] price-calculator.test.ts and tests/site-smoke.test.ts assert the new behaviour (e.g. data-dirty presence driven by on-dirty/on-clean) instead of `classList.contains("is-dirty")`, and no other test asserts the removed class.
- [ ] README.md is updated: implementations table row (verbs markClean, config dirty-on, events dirty/clean, description), the storable paragraph (restore is seen directly; on-restore="this.markClean()" remains as the example of committing a restored baseline), the no-state sentence and code sample (closure holds one boolean; the default is the platform's; one sentence that defaultValue is live), the config read-only bullet, the +5 trace (fires dirty if #qty was clean), and the obsolete "Why not data-dirty" FAQ entry is removed.
- [ ] site/docs.html (table row, storable paragraph, no-state paragraph, dirtyable code sample, config bullet, the two-line on-dirty/on-clean example, price-calculator markup), site/reference.html (dirtyable card), site/styles.css (.demo .is-dirty → a [data-dirty] rule), site/index.html and site/examples.html (demo elements and their <code> mirrors carry on-dirty="this.setAttr({name:'data-dirty',value:''})" and on-clean="this.removeAttr('data-dirty')") are updated; `rg -n "is-dirty" site/` returns nothing.
- [ ] pnpm check, pnpm test and pnpm build all pass on the committed tree, with the total test count not below the 427 baseline.

## Verification

`pnpm check && pnpm test && pnpm build` pass; `rg -n "is-dirty" site/` returns nothing; `rg -n "is-dirty|classList" registry/behaviors/dirtyable/` returns nothing (the implementation writes no class); `pnpm test` reports the dirtyable suite at or above its previous 5 tests.

## Prohibited Patterns

- Do not touch the host or executor — restore is subscribed through the existing on* binding in the factory.
- Do not introduce a connect-time closure baseline of el.value, and do not write any class/attribute from the implementation.
- Do not dispatch dirty/clean when the reported state is unchanged, and do not fire anything at connect.
- Do not use `this.removeAttr({name: ...})` anywhere — attributable's removeAttr takes a bare string (`this.removeAttr('data-dirty')`).
