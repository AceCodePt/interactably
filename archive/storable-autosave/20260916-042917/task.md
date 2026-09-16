---
wait_human_start: false
wait_human_merge: false
dependencies: [implementation-events, revealable-radio-exclusivity]
---

# Task: storable: save/load/clear verbs, no auto-persist, key inference to id

## Metadata

- **Complexity:** High
- **Priority:** Medium
- **Status:** Ready for Handoff

## Context

Revision of the archived storable-autosave task. The first generation merged (253f756) a verbless auto-persist storable: `verbs: {}`, an `onChange` handler that saves on change, key inference `key ?? name`, `scope`/`key` config, the `interactable:` storage prefix, DOMContentLoaded-deferred restore, and native-`change` dispatch on restore. This revision reverses the verbless decision: restore the three verbs `save`/`load`/`clear` (matching the shipped table), REMOVE auto-persist (nothing is stored unless a phrase calls `save()` — saving is an act you can see in the markup), and extend key inference to `storable-key ?? name ?? id`. The readiness deferral, native-change restore, checkbox/radio array shape, and prefix stay. Depends on implementation-events and on revealable-radio-exclusivity (revised): the site's synchronisation example (radios `name=\"pm\"`) comes from that task and this task adds `implements=\"storable\"` + `this.save()` to it and updates the shared smoke test — it lands second and updates the example.

## Requirements

- [ ] `defineImplementation("storable", { tags: ["input", "select", "textarea"], config: { scope: "'local' | 'session' | undefined", key: "string | undefined" }, verbs: { save: "undefined", load: "undefined", clear: "undefined" } })` — config already matches; add the three verbs to the merged implementation.
- [ ] Key inference becomes `storable-key` else `name` else `id`; a field with none of the three warns once on connect and does nothing (update the warning message to name all three). Storage key stays `interactable:<key>`.
- [ ] Delete the auto-persist `onChange` handler and its `restoring` guard. The native `change` dispatched by restore now runs the author's own `on-change` phrase (that is the point).
- [ ] Restore stays: in `connectedCallback`, if `document.readyState === "loading"` defer to `DOMContentLoaded` (once) and restore then, skipping if the element disconnected in between; otherwise immediate. try/catch the read; nothing stored or unchanged -> return; apply (radio/checkbox set `checked` from the JSON array, else `value`); dispatch a native `change` (`bubbles: true`).
- [ ] `save()` writes: checkable (radio/checkbox) -> JSON array of `value`s of every checked control sharing this `name` and form owner (`el.form ?? document`); else `String(el.value)`. `load()` calls `restore()` directly with no readiness check (a user action). `clear()` removes the key. All Storage access wrapped in try/catch.
- [ ] Tests (rewrite storable.test.ts): text field restores and fires exactly one `change`; an unchanged value fires none; no stored value -> no change and the authored value untouched; three storable radios sharing `name`, stored `["pnpm"]` -> only pnpm flips, exactly one `change`, authored `checked` overridden; two same-name checkboxes -> check both, `save()` on either, reload restores both, stored value is the JSON array of both values; a same-name radio in a different `<form>` is excluded from the saved array; `scope="session"` uses sessionStorage and the default uses localStorage; `storable-key` overrides `name` and `name` overrides `id`; none of the three warns once and stores nothing; typing (`input`) does NOT persist while `save()` does; `load()` after typing reverts to the stored value and fires `change`; `clear()` removes the key and a subsequent connect restores nothing; `Storage.getItem` throwing does not break connect and `setItem` throwing does not break `save()`; while `readyState` is "loading" restore defers until a synthetic `DOMContentLoaded` (fires `change` once) and is immediate at "complete"; integration with the revealable synchronisation example (a storable radio whose `on-change` opens revealable panels further down — after a simulated load the right panel is open and the siblings closed).
- [ ] Docs: README storable row becomes `save`, `load`, `clear` | `scope`, `key` | "persist a field's value to storage; restores on connect and fires `change`"; rewrite the storable section (key inference order; "same-name checkboxes store as a list"; "nothing is saved unless a phrase calls `save()`"; "restore waits for the document to finish parsing"; "restore fires a native `change`, so your `on-change` phrase runs"); remove the "memory with no verbs" phrasing at README:345 and site/docs.html:503; update the site/docs.html:425 row; update the reference.html storable card (verbs, config, description); note in the docs that `name="pm"` does two jobs in the synchronisation example (radio grouping and storage key) and that is the point.
- [ ] Site: the synchronisation example radios (from the revised revealable task) gain `implements="storable"` and `this.save()` appended to each `on-change` phrase; the note demo textarea (site/examples.html:373-377 and its code block at 393-397) gains an `on-change` phrase calling `this.save()`; check for any remaining `storable-type`/`storable-attr` references (none should exist).
- [ ] Site smoke test: the manager block (tests/site-smoke.test.ts:166-178) is updated to pre-seed `localStorage["interactable:pm"]`, keeps the readyState-override + synthetic DOMContentLoaded page-load simulation, and asserts the stored radio is checked and its panels open, siblings closed, then clicking another radio stores the new selection; the note block (281-290) asserts the value persists via the new `this.save()` phrase.

## Verification

`pnpm check` and `pnpm test` pass on the committed tree. `rg -n "no verbs|persists it on change|persists on change" README.md site/*.html` returns nothing. The README row shows `save`, `load`, `clear`. The site smoke test's note and manager blocks pass with the `this.save()` phrase and the `interactable:pm` key.

## Prohibited Patterns

- No auto-persist: delete the `onChange` handler and its `restoring` guard; nothing is stored unless a phrase calls `save()`.
- No `attr` config and no `type` config (already renamed `scope`).
- Do not touch the hash (hashable, separate), IndexedDB, or anything server-side.
- No `storage` event listener, no cross-tab sync, no `on-storage-*` trigger — a storage write from another script or tab is not an interaction.
- Restore's change must stay a native `change` (`bubbles: true`), never an ImplementationEvent.
- `<select multiple>` stays out of scope (treated as single-value select).
