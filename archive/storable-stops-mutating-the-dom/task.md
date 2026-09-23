---
wait_human_start: false
wait_human_merge: false
dependencies: [event-value-binding]
---

# Task: storable stops mutating the DOM

## Metadata

- **Complexity:** Medium
- **Priority:** Medium
- **Status:** Ready for Handoff

## Context

storable acquired DOM-writing behaviour for one reason: the restored value had nowhere to go, so the implementation had to put it somewhere itself. That was always implicit behaviour standing in for a missing capability. Once event-value-binding makes restore expose its value through its event, the author decides where it lands — with render, with set, with whatever suits. storable goes back to being storage, which is what its name says. This also supersedes the filtering half of the storable-refs-and-restore-filtering work (which landed directly as commit 1784c50): that brief made restore fire with the stored string as ImplementationEvent.key and had phrases filter on it with a colon prefix, which meant an unkeyed on-restore phrase was skipped entirely. With the binding, the phrase receives the value instead of filtering on it. Its other half — fixing what storable-value can point at for reading — is untouched by this and still needed.

## Requirements

- [ ] restore declares its value: the event exposes on-restore(value:string) with the restored string bound to the declared name value. storable's key dispatch is removed entirely, alongside the colon-prefix keyed filtering on restore phrases — the phrase receives value and never filters. The executor's keyed branch stays for intersect margins and request-error keys.
- [ ] storable contains no DOM mutation: writeSlot and its write resolution are removed from registry/behaviors/storable/storable.ts. restore() reads the key, fires the restore event with the stored string as value, and never touches innerHTML or any property. save() still reads the declared slot (literal, bare ref, or property ref) exactly as today.
- [ ] storable-target and storable-swap stay dead and gain a documented reason to stay dead: the value binding removes any need for a write-target config, so no write-direction storable is introduced and the docs say so.
- [ ] site/examples/remember-theme.html, site/examples/remembered-tab.html and site/examples/synced-sections.html migrate from keyed on-restore phrases to the value binding, remember-theme included; the embedded 'Show the markup' code blocks and lede paragraphs match the live markup. The dirtyable restore-baseline test at registry/behaviors/dirtyable/dirtyable.test.ts:235 stops keying on-restore and moves its baseline via the value binding instead.
- [ ] tests/site-smoke.test.ts restore blocks stay green: the synced-sections pm panels (stored pnpm opens pnpm panels, npm/bun panels close), the theme example (on-load restore paints the stored data-theme and reveals the toast), and the remembered-tab example (restore flips and refocuses) all still hold after migration.
- [ ] Four-homes parity: the docs.html storable table row and the storable section, the reference.html storable card, the README.md storable row and the index.html storable chip all describe the new semantics — restore carries value, nothing is written to the DOM, restore does not filter.
- [ ] Tests: the storable suite drops the write-path cases (restore writing innerHTML or a property) and the keyed-filtering cases, and gains cases that restore dispatches value with nothing written. pnpm check and pnpm build && pnpm test pass on the committed tree.
- [ ] storable-value refs for reading are untouched: a bare ref or property ref still names what save() stores, and this task does not change that half of the storable-refs-and-restore-filtering work.

## Verification

On the committed tree: pnpm run build && pnpm test && pnpm run check all pass. Concretely: the storable suite has no test asserting restore() writes innerHTML or a property and has tests asserting the restore event carries the stored string as its declared value with no DOM mutation; the dirtyable restore-baseline test passes with the value binding instead of a keyed phrase; the four-homes parity test in tests/site-smoke.test.ts passes; and the site-smoke restore blocks for synced-sections, theme and remembered-tab still assert the same stored-state outcomes after migration.

## Prohibited Patterns

- No reintroducing storable-target, storable-swap, or any write-direction storable config.
- No DOM mutation in storable's restore path: no innerHTML or property writes.
- No lingering keyed restore filtering: restore must not dispatch ImplementationEvent.key and phrases must not filter with a colon prefix.
- Do not change the read half of storable-value refs — save() reading a literal, bare ref, or property ref stays as it is today.
- Do not alter the executor's keyed branch used by intersect margins or request-error keys.
- No /tmp scratch work; any scratch lives in <repo>/scratch/ and is deleted before finishing.
- No code comments unless requested.
