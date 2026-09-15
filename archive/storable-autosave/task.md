---
wait_human_start: false
wait_human_merge: false
dependencies: [revealable-radio-exclusivity]
---

# Task: storable: a form field remembers its own value across loads

## Metadata

- **Complexity:** High
- **Priority:** Medium
- **Status:** Ready for Handoff

## Context

The current storable is verb-driven (save/load/clear verbs, key/type/attr config) and manual. Redesign: a form field restores and persists its own value across loads with no verbs — nothing else knows it exists. Restore must wait for the document to finish parsing (`DOMContentLoaded` while `readyState === \"loading\"`) so initial-load markup works regardless of element order; the remaining gap (elements connected after parse, e.g. a swapped fragment) is the readiness-replay item from the open list — logged, not solved. Depends on Task B for the site's package-manager example, whose radios gain `implements=\"storable\"`.

## Requirements

- [ ] `defineImplementation("storable", { tags: ["input", "select", "textarea"], config: { scope: "'local' | 'session' | undefined", key: "string | undefined" }, verbs: {} })`. Default scope `local`. Storage key `interactable:<key ?? name>`. A field with no `name` and no `key` warns once and does nothing.
- [ ] Restore in `connectedCallback`: if `document.readyState === "loading"`, wait for `DOMContentLoaded` (once) and restore then; otherwise restore immediately; the deferred path skips when the element is no longer connected. radio/checkbox: the stored value is a JSON array of checked values for that name; set `checked = stored.includes(this.value)`; everything else: set `value`; if unchanged, stop; else dispatch a native `change` (`bubbles: true`) on the element whose state actually changed, so a radio group restoring produces exactly one `change`.
- [ ] Save via an `onChange` handler on the instance (the host wires it alongside the author's phrase): radio/checkbox -> read every checked control with that name in the same form owner (`el.form ?? document`) and store the JSON array; otherwise store `value`. `try/catch` around all storage access — quota and private mode fail silently.
- [ ] Tests: a text field restores and fires one change; an unchanged value fires none; a radio group of three restores exactly one change on the right one; two checkboxes with one name store and restore as a list; session scope uses `sessionStorage`; `key` overrides `name`; no name and no key warns; storage throwing does not break connect; authored `checked` is overridden by the stored value; while `document.readyState` is `"loading"` restore defers until `DOMContentLoaded` and fires then.
- [ ] Site: the package-manager tabs example from Task B gains `implements="storable"` on each radio; the note example drops its `#note.clear()` button (storable has no verbs) and the site smoke test switches to a `change` event and the new storage key (`interactable:interactably-demo-note`); the reference.html storable card and README table row are rewritten.
- [ ] Docs: a new implementation section; one sentence: same-name checkboxes store as a list; the ordering note reads "restore waits for the document to finish parsing" — elements connected after parse (e.g. a swapped fragment) restore immediately and may hit the readiness-replay gap (NotReadyError), logged against that open-list item, not solved here.
- [ ] Site smoke test: simulate the page-load sequence (override `document.readyState` to `"loading"` before injecting the markup; import bundles; install the auto-loader; pre-seed `localStorage["interactable:manager"]`; dispatch a synthetic `DOMContentLoaded`) and assert the stored radio is checked and its panel open, then click another radio and assert radio exclusivity.

## Verification

`pnpm check` and `pnpm test` pass on the committed tree, including the rewritten storable tests and the updated site smoke test. `rg -n "storable-(save|load|clear|attr|type)|#note\.clear" README.md site/*.html` returns nothing outside archive/.

## Prohibited Patterns

- No verbs — delete `save`/`load`/`clear`.
- No `attr` config and no `type` config (renamed `scope`).
- Do not solve readiness replay (no interaction queueing); log the swapped-fragment gap against the open-list item.
- Do not change the storage key scheme `interactable:<key ?? name>`.
- Restore's change must be a native `change` (`bubbles: true`), never an ImplementationEvent.
