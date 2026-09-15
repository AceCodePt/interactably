---
wait_human_start: false
wait_human_merge: false
dependencies: [implementation-events]
---

# Task: on-intersect-* synthetic triggers

## Metadata

- **Complexity:** High
- **Priority:** Medium
- **Status:** Ready for Handoff

## Context

The DSL needs scroll-spy-style triggers with no implementation and no `implements`. Three names map to IntersectionObserver thresholds; the phrase key slot is a CSS-margin string that becomes `rootMargin`; each `;` phrase observes its own margin; the viewport is the root. The synthetic-name table feeds the non-native lookup introduced by Task A as a second source, and the executor's key guard grows a third branch for these synthetic events.

## Requirements

- [ ] `registry/interactable/intersect.ts`: table `intersect-enter -> 0`, `intersect-half -> 0.5`, `intersect-full -> 1`; `normaliseRootMargin(key?)` where undefined/empty -> "0px" and otherwise the string must be CSS lengths or percentages only (1-4 space-separated tokens), else it throws; `syncIntersect(el)` / `teardownIntersect(el)` managing one `IntersectionObserver` per `(threshold, rootMargin)` triple with a viewport root; the callback dispatches `new ImplementationEvent(type, { key: rootMargin })` on every threshold crossing, both directions.
- [ ] Host wiring in `interactable-host.ts`: the three intersect names are added to the host's static observed attributes; `syncIntersect` runs in `connectedCallback` and on intersect-attribute change; `teardownIntersect` runs on disconnect.
- [ ] Parser: `parse(value, eventName?)` — under the three intersect names the phrase key is validated as a CSS margin (lengths and percentages only; otherwise a parse error that drops and logs the phrase); the `KEY` regex gains this margin-shaped alternative under these three names only; the cache key includes the event name.
- [ ] Executor key guard at `executor.ts:51` becomes three-way: keyboard events -> `matchesKey`; `ImplementationEvent` with `ev.key` defined -> run only phrases whose `normaliseRootMargin(phrase.key)` equals `ev.key` (a keyless phrase matches "0px"); else -> the existing skip-and-log.
- [ ] The non-native lookup from Task A consults the synthetic intersect table as a second source, so `on-intersect-*` needs no `implements` and never warns about a missing event.
- [ ] `src/core.ts` exports the intersect module pieces as appropriate; `rolldown.config.mjs` coreFiles gains `registry/interactable/intersect.ts`.
- [ ] Tests: threshold per name (0 / 0.5 / 1); key -> rootMargin mapping (missing -> "0px"); invalid margins rejected (`red:`); per-`;` phrases observe separate margins; viewport root; fires every crossing both directions; `once()` is the only filter; observer rebuilt on attribute change and torn down on disconnect; no bare `on-intersect`; the third-branch regression (a keyed phrase on a non-matching synthetic event is skipped quietly, and a keyless intersect phrase only reacts to its "0px" observer). jsdom gets a controllable `IntersectionObserver` stub exposing `trigger(entries)`.
- [ ] Docs: synthetic triggers as a third trigger category (alongside native DOM events and implementation events); a sentence that each `;` phrase observes its own margin; one scroll-spy example.

## Verification

`pnpm check` and `pnpm test` pass on the committed tree, including the new intersect tests and the executor/parser key-guard tests. `rg -n "on-intersect" README.md site/*.html` shows only the documented three names (`on-intersect-enter`/`on-intersect-half`/`on-intersect-full`).

## Prohibited Patterns

- No direction guard (no entering/leaving distinction), no bare `on-intersect`, no `root` option, no `implements="intersectable"`.
- Don't change the executor's otherwise-existing key semantics; the third branch is additive.
- Don't gate keyless non-synthetic implementation events (e.g. `on-copy`, `on-response`) — keyless phrases there keep running.
- No IntersectionObserver usage without a `typeof IntersectionObserver === "undefined"` guard.
