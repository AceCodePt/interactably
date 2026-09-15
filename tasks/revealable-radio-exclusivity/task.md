---
wait_human_start: false
wait_human_merge: false
dependencies: [implementation-events]
---

# Task: revealable: one setter, radio-derived exclusivity, controllers wired at connect

## Metadata

- **Complexity:** High
- **Priority:** High
- **Status:** Ready for Handoff

## Context

revealable has three verbs (show/hide/toggle), a hardcoded ARIA sync and no exclusivity. Goal: one boolean setter (show), delete hide; exclusivity derived from the platform's radio group the way `<details name>` uses it; controllers wired at connect from parsed `on-*` phrases so tab ARIA stays unambiguous. Depends on Task A (implementation events) so the connect-time scan and the host behavior around declared events are settled first.

## Requirements

- [ ] revealable verbs become `show: "boolean | undefined"` (`show()` means `show(true)`) and `toggle: "undefined"`; delete `hide`.
- [ ] Radio-derived exclusivity: in `show` when opening (`value ?? true`) and `e.source` is an `<input type="radio">` with a non-empty `name`, collect sibling radios (same name, same form owner `source.form ?? document`, excluding the source); for each sibling, dispatch a `show(false)` InteractionEvent (source = sibling) on every connected revealable host other than this panel that the sibling *controls*; then open itself. Checkbox and button sources do nothing.
- [ ] One shared parse-based helper `controlledPanelIds(host)` in revealable.ts: for each `on-*` value run `parse(value)` (cached) and collect the ids of units whose ref is `#id` and which carry a controlling call — verb `toggle()`, or verb `show` with an arg that is not the literal `false` (`show()`, `show(true)`, `show(this.checked)`). `show(false)` is a side effect, not control. Used by both the connect-time wiring and radio exclusivity.
- [ ] Controllers wired at connect: in `connectedCallback` when `el.id !== ""`, scan `document.querySelectorAll('[is^="interactable-"]')`; for each host with `controlledPanelIds(host).has(el.id)`, append `el.id` to its `aria-controls` (dedup, preserve tokens) and set `aria-expanded` to the current state only where the role permits (not on radio/checkbox inputs); skip the panel itself.
- [ ] `syncAria` takes a `control` flag: `show` passes the resolved value (so `show(false)` is non-control), `toggle` passes true; the bare-source `aria-controls` write is skipped when `control` is false; the controller walk applies the same role check for `aria-expanded`.
- [ ] Tests: `show()` / `show(true)` / `show(false)` / `toggle()`; a radio source closes siblings' panels across strategies (data-open div + popover); a radio in a different form with the same name is not a sibling; a checkbox source closes nothing; a button source closes nothing; a sibling whose phrase names a non-revealable id is skipped; a sibling with only `show(false)` targets closes nothing; wiring: a button with `on-click="#p.show()"` present before the panel connects gets `aria-controls="p"` and `aria-expanded` after; a radio gets `aria-controls` only; `#px` is not wired to `#p`; existing tokens are preserved; a `#p.show(false)`-only host is NOT wired; a mixed `#a.show(); #b.show(false)` host wires only `a`; syncAria does not write `aria-controls` onto a `show(false)` source.
- [ ] Docs: remove every `hide()` from README.md and site/*.html (`show(false)` where the intent was a close); the revealable verb table shows two verbs with the boolean; one paragraph: a panel shown from a radio closes the panels of that radio's siblings, no attribute needed; describe the connect-time wiring; reference.html revealable card updated.
- [ ] Site: new package-manager tabs example in examples.html — three radios named `manager`, each `on-change="#pm-<x>.show()"`, three revealable divs (ids `pm-<x>`), no group attribute, plus the copyable code block; the existing site tabs ARIA stays correct (the exact-value `[aria-controls='demo-auto']` selectors in site-smoke.test.ts keep matching).

## Verification

`pnpm check` and `pnpm test` pass on the committed tree, including the site smoke test unchanged in its tabs block. `rg -n "\.hide\(" README.md site/*.html` returns nothing outside archive/. The revealable tests cover the radio-exclusivity and wiring cases listed above.

## Prohibited Patterns

- Do not touch the parser, executor, intersect, or the connect-time visibility behaviour (review item 4, separate).
- No `revealable-group` config and no group attribute — exclusivity is derived from the browser's radio group.
- No substring `#<id>.` scanning — every scan of `on-*` values must go through the cached `parse(value)`.
- No `aria-expanded` on radio or checkbox inputs.
