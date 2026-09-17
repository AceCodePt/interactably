---
wait_human_start: false
wait_human_merge: false
dependencies: []
---

# Task: One document-readiness rule, in the host

## Metadata

- **Complexity:** Medium
- **Priority:** High
- **Status:** Ready for Handoff

## Context

Review 2, item G. `registry/behaviors/modifiable/modifiable.ts:69` runs `compute()` from `connectedCallback` with no check that the document has finished parsing. When the library loads as a synchronous (non-module) script in `<head>` (the CDN case), hosts upgrade while the parser is still in the body, so the formula's `#id` references do not exist yet. Today a missing reference reads as `""` and the output gets a wrong number; once bug 6(a) of `task-review-2-bugs.md` lands, a missing reference throws and the same page writes `invalid-value` ("Error") into the output on load. `registry/behaviors/storable/storable.ts:148-166` already guards exactly this by parking `restore()` behind a once-only `DOMContentLoaded` listener; the next implementation to read the document at connect would forget it. README.md:936 promises every `#id` resolves after the document is upgraded; a connect-time hook is the one place that promise is not kept. The host should own the single rule so every implementation (modifiable, storable, and whatever follows) is covered.

## Requirements

- [ ] `interactable-host.ts` `connectedCallback`: when `ownerDocument.readyState === "loading"`, the per-implementation connect loop (`implementation.connectedCallback?.()` + `wireImplementationHandlers`) is deferred behind one `DOMContentLoaded` listener owned by the host; otherwise it runs immediately as today.
- [ ] The deferred listener is `{ once: true }`, re-checks `this.isConnected` before running and does nothing if the host left the document, is removed by `disconnectedCallback`, and a reconnect-while-pending never registers a second listener.
- [ ] `wireTriggers`, `syncIntersect`, `wireAttributeObserver`, `ensureImplementations`, `trackConnectedHost` stay immediate; `ensureImplementations`' inline `connectedCallback` + `wireImplementationHandlers` call also defers when loading (it is the first-connect attach path).
- [ ] A code comment states the choice to defer `wireImplementationHandlers` together with `connectedCallback` (the only `on<Event>` handlers are paste/input/change/interaction, none can fire before `DOMContentLoaded`).
- [ ] `storable.ts` guard removed: `connectedCallback` is `warnIfNoValue(); restore();`, `disconnectedCallback` and `pendingReady` are deleted (and the now-unused `doc` local).
- [ ] The `connectedCallback` slot in `implementation-utils.ts` (`ImplementationInstance`, re-exported via `_implementation-definition.ts`) carries the note: Runs once the document is parsed; `#id` references resolve.
- [ ] README.md:938 gains one clause: connect-time work such as modifiable's initial compute() waits for the document when the library is loaded synchronously.
- [ ] One sentence in `site/docs.html` beside the CDN `<script>` quickstart: a synchronous tag in `<head>` is fine because connect-time work waits for the document.
- [ ] Host tests (jsdom, readyState stubbed): a `modifiable` with `formula="#a.value + 1"` connected before `#a` exists emits no `console.error` and leaves output untouched; after `#a` is inserted and `DOMContentLoaded` dispatched, output is computed.
- [ ] Host tests: connect-then-disconnect while pending runs nothing on `DOMContentLoaded`; connect-disconnect-reconnect while pending runs the implementation `connectedCallback` exactly once on `DOMContentLoaded`.
- [ ] Host tests: with `readyState === "complete"`, `connectedCallback` still runs synchronously in `connectedCallback` (existing tests that assume this keep passing).
- [ ] `storable`'s three `DOMContentLoaded` tests move to the host test file and still pass with the guard removed from `storable`; total test count does not go down.
- [ ] Elements connected after the document is ready (`readyState === "complete"`) connect synchronously; no microtask or frame defer is added for that case.

## Verification

`pnpm check` (tsc --noEmit) and `pnpm build` stay clean. `pnpm test` passes with the count not below baseline (446 in the current tree). Observable: under jsdom with readyState stubbed to "loading", a `modifiable` with `formula="#a.value + 1"` connected before `#a` exists neither logs an error nor writes to its output; once `#a` is inserted and `DOMContentLoaded` fires, the output equals the computed value.

## Prohibited Patterns

- Do not add a microtask or frame defer for the `readyState === "complete"` case (an element inserted after the document is ready must connect synchronously).
- Do not add code comments beyond the two the brief requests (AGENTS.md: no comments unless requested).
- Do not touch the unrelated uncommitted working-tree changes in `registry/interactable/intersect.ts` and `tests/intersection-observer.ts`.
- Do not change `modifiable.ts` — its `connectedCallback: () => compute()` becomes correct purely because the host defers it.
