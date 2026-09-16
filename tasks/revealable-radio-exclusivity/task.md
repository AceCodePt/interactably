---
wait_human_start: false
wait_human_merge: false
dependencies: [implementation-events]
---

# Task: revealable: literal-only control, no-source ARIA sync, synchronisation example

## Metadata

- **Complexity:** High
- **Priority:** High
- **Status:** Ready for Handoff

## Context

Revision of the archived revealable-radio-exclusivity task. The first generation merged (7a406b3): one `show` setter + `toggle`, radio-derived exclusivity, controllers wired at connect, role-checked `aria-expanded`. This revision tightens the definition of a *controlling call* to the three literal forms, gives `syncAria` a no-source form for the sibling-closing path, replaces the site's single-section package-manager example with the three-section synchronisation example, and adds a "When not to use this library" scoping statement. Runs against current main, which already contains the first-generation merge — adjust it, do not rebuild from scratch. Depends on implementation-events (already merged and archived).

## Requirements

- [ ] Verbs stay `show: "boolean | undefined"`, `toggle: "undefined"`; `hide` stays deleted with no shim (already in place).
- [ ] Narrow the controlling-call predicate: a host controls a panel only via `#id.toggle()`, or `#id.show()` with no argument, or `#id.show(true)` (boolean literal true). `#id.show(false)` is a side effect; non-literal arguments such as `#id.show(this.checked)` are NOT control. Fix `isControllingCall` in revealable.ts and the README:335 / site/docs.html:496 paragraphs that currently list `show(this.checked)` as controlling.
- [ ] `syncAria`'s `source` parameter becomes optional (no-source form). The radio sibling-closing path dispatches `show(false)` through the panel's own verb path with NO interacting source. With no source, nothing is written onto a source element, but the existing walk over `[aria-controls]` holders naming the panel still refreshes `aria-expanded` where the role allows (button/summary yes, radio/checkbox no). A runtime `aria-controls` claim happens only for the three controlling call forms; `show(false)` never claims.
- [ ] Keep the merged behavior unchanged: four strategies (details/dialog/popover/data-open), radio-derived exclusivity via siblings sharing `name` and form owner, connect-time wiring (deduped tokens, existing preserved), `canBeExpanded` role check, no `aria-labelledby`/`role="region"`/tab semantics.
- [ ] Tests (existing revealable tests stay green; add these): `#p.show(this.checked)` is NOT wired at connect and a `show(this.checked)` call writing aria-controls at runtime is asserted as the resolved-value behavior; `#p.show(true)` IS wired; a radio with an empty `name` closes nothing; a sibling naming a non-existent id is skipped silently; via the sibling-closing no-source path a closed panel's button controller gets `aria-expanded="false"` while the radio source gets none; the two site smoke tabs selectors at tests/site-smoke.test.ts:350-357 pass unchanged.
- [ ] Docs: README and site/docs.html narrow the control set in the "Controllers are wired at connect" paragraph and state that non-literal arguments are not control; add the "When not to use this library" section to README (near "Not supported") and site/docs.html using the agreed draft (push-not-pull scoping statement; the tabs example as the honest boundary case; reactive/data-flow systems and `requestable` for the rest).
- [ ] Site examples.html: REPLACE the ex-pkg example with the three-section synchronisation example — one radio group `name="pm"` with ids `pm-npm`/`pm-pnpm`/`pm-bun` inside `<div role="radiogroup" aria-label="Package manager" class="visually-hidden">`, each radio `is="interactable-input"` with `on-change="#install-<x>.show(); #config-<x>.show(); #trouble-<x>.show()"`; three sections (install/config/troubleshooting) each with a label tab-bar (`<label for="pm-<x>">`) and three `<div is="interactable-div" id="<section>-<x>" implements="revealable">` panels (data-open on the -npm ones, hidden elsewhere). The copy names the tradeoff plainly: adding a fourth section means editing all three radio phrases, and that is the price of push.
- [ ] Site smoke test: update the manager block (tests/site-smoke.test.ts:166-178) to the new structure — radios `name="pm"`, panels `install-*`/`config-*`/`trouble-*` — asserting radio clicks open/close panels; leave storage pre-seed and restore assertions to task storable-autosave (no `implements="storable"` on these radios in this task); keep the readyState-override page-load simulation (the note textarea remains storable).

## Verification

`pnpm check` and `pnpm test` pass on the committed tree, including the site smoke test with its tabs block (site-smoke.test.ts:350-357) unchanged. `rg -n "show\\(this\\.checked\\)" README.md site/*.html` matches only the explicit \"non-literal arguments are not control\" sentences, never a control list. The new revealable tests cover the narrowed predicate, no-source syncAria, empty-name radio, and non-existent-id sibling.

## Prohibited Patterns

- Do not touch the parser, the executor, or anything intersect-related.
- Do not change connect-time visibility behaviour (the `data-open="true"` workaround is review item 4, separate).
- No group attribute and no `revealable-group` config; no `hide` verb or alias.
- No `aria-labelledby`, `role="region"`, or tab-semantics writes — panel labelling belongs to the author.
- Do not add any substring `#<id>.` scanning — every scan of `on-*` values goes through the cached `parse()`.
- Runtime control determination is resolved-value-based (the verb sees only the resolved arg, per executor.ts:165); do not change the executor to make it literal-precise.
