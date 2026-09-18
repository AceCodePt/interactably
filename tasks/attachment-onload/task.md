---
wait_human_start: false
wait_human_merge: false
dependencies: [attachment-site]
---

# Task: on-load: attach-time, two passes, not a DOM listener

## Metadata

- **Complexity:** Medium
- **Priority:** High
- **Status:** Ready for Handoff

## Context

Slice 5 of drop-customized-builtins (brief order 5). on-load lands in attach()/start() with its tests. The site must not use on-load yet (storable adds its usage in the impls slice). No docs changes. Baseline green at main; attach()/start() exist from the earlier slices.

## Requirements

- [ ] attach() reads on-load after that element's implementations are instantiated and wired, and calls runPhrases(el, value, new ImplementationEvent("load")) directly - it is not a DOM listener. A <template> is inert (nothing inside attaches), so a clone's on-load fires exactly once on insertion; a move is not a re-attach so it does not re-fire.
- [ ] Two passes: the start() scan and each observer callback attach every element in the batch first, then fire the batch's on-load phrases in document order - so <button on-load="#panel.open()"> before #panel in the initial document resolves; pinned by a test.
- [ ] The per-attribute bind helper (wireTriggers body) skips the name load: no bind and no "no such event" warning for it; the attribute observer's on-* add/remove branch ignores load (adding on-load to an already-attached element does nothing).
- [ ] The native load event is not reachable through the DSL: on-load means attach even on <img>, <iframe>, <body>, <link>, <script>; there is no on-native-load.
- [ ] attach.test.ts on-load tests: fires once for an element in the initial scan and once for a later insertion; a <template> holding an on-load element fires nothing until a clone is inserted, then once; a move (remove + append in one task) does not re-fire; <button on-load="#panel.open()"> before #panel works (two passes); <img on-load="…"> fires at attach, not when a load event is dispatched at it; on-load="this.verb()" where verb belongs to an implementation on the same element resolves (implementations before load).
- [ ] pnpm check + pnpm test green; no docs or site changes.

## Verification

pnpm check && pnpm test pass; the attach.test.ts on-load suite is green.

## Prohibited Patterns

- Do not bind a DOM load listener and do not reach the native load event; no on-native-load.
- Do not touch README/site prose; the site must not use on-load yet.
- No code comments beyond the brief's.
