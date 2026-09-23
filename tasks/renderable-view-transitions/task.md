---
wait_human_start: false
wait_human_merge: false
dependencies: []
---

# Task: View transitions on renderable, on by default with an opt-out

## Metadata

- **Complexity:** Medium
- **Priority:** Medium
- **Status:** Ready for Handoff

## Context

Same-document view transitions are Baseline (Chrome/Edge 111+, Firefox 133+, Safari 18+). Every swap this library performs is same-document, so `document.startViewTransition(callback)` can animate every mutation. Decision: transitions are ON BY DEFAULT (a deliberate exception to the no-implicit-behaviour principle, which exists to prevent silent failures — a crossfade is visible, wanted, and degrades to the instant swap where unsupported). Earlier drafts assumed storable and requestable also mutate, but storable no longer mutates (restore exposes the recovered value through its event) and requestable hands its payload to render, so renderable is the only place markup reaches the DOM: this task touches one implementation file. The transition defers the visible settle, so the executor cannot wait: a `.` chain continues on the same receiver and a `;` phrase is fire-and-forget. renderable declares no events today; it gains a render-completion event whose only job is timing, and site/examples/dynamic-list.html must move its counter into it. Two elements sharing a view-transition-name in one snapshot skip the ENTIRE transition silently (no exception, no console warning) — exactly the silent-failure pattern this library rejects — so the docs must state it plainly and distinguish view-transition-name (identity) from view-transition-class (grouping label) from ::view-transition-old/new (pseudo-elements custom keyframes target). Out of scope: moving an element between two side-by-side visible containers (would duplicate the name; needs imperative naming for the transition duration) — not supported, not documented.

## Requirements

- [ ] registry/behaviors/renderable/renderable.ts wraps every DOM-mutating render branch in document.startViewTransition, feature-detected (`typeof document !== 'undefined' && typeof document.startViewTransition === 'function'`); where the API is absent it calls the mutation directly. `last` is assigned inside the wrapped callback so `undo()` immediately after `render()` still reverses synchronously.
- [ ] New config `"disable-view-transition": "'boolean' | undefined"` (kebab-case key, mirroring dirtyable's `dirty-on`), giving attribute `renderable-disable-view-transition`; present-but-not-`"false"` opts out. The negative name means the attribute appears in markup only when someone opts out.
- [ ] renderable declares exactly one new event named `rendered` (globally unique across all registered implementation events — pasted, copy, restore, dirty, clean, response, request-error — since the registry rejects any tags-overlap duplicate and renderable is tagless). It carries NO value. It fires once the swap settles: after the transition's `finished` promise in the wrapped path, immediately after the mutation in the fallback path. It fires for every successful mutation (all swaps except `none`); never when a slot/id validation throws.
- [ ] site/examples/dynamic-list.html moves the counter out of the trailing semicolon phrase into the completion event: `<ul id="dl-list">` gains `on-rendered="#dl-count.set(count('#dl-list li'))"`; the Add and per-row × buttons drop their `; #dl-count.set(...)` phrase; the Undo button keeps its trailing phrase (undo stays synchronous). The embedded 'Show the markup' code block and the lede paragraph are updated to match.
- [ ] Site parity (the four-homes test in tests/site-smoke.test.ts enforces all four): docs.html renderable table row's Config/state column names `renderable-disable-view-transition` and its What-it-does column names the `rendered` event; a new renderable docs section with a `toc-renderable` nav link and matching on-intersect-enter/leave triggers (the docs-sidebar test requires every nav link to have an enter trigger and a matching leave) states the duplicate-`view-transition-name` silent-skip failure mode plainly and distinguishes the three mechanisms — `view-transition-name` is identity (match-element is the only reliable cross-browser auto-naming mechanism, same-document only), `view-transition-class` is a styling-only grouping label so `::view-transition-group(*.card)` reaches all of them, `::view-transition-old`/`::view-transition-new` are the generated pseudo-elements custom keyframes target, wrapped in `prefers-reduced-motion`; reference.html renderable card gains the config and event tags; README.md renderable table row is updated.
- [ ] Tests: the existing renderable suite passes unchanged on the fallback path (jsdom lacks startViewTransition). New tests inject a fake `document.startViewTransition` that runs the callback synchronously and returns `{ finished: Promise.resolve() }` to verify: the wrapped path fires `rendered` after `finished` resolves; `renderable-disable-view-transition` skips the wrap even with the fake installed; `rendered` is not fired for swap `none` or when a slot/id validation throws; `undo()` still reverses while a transition is pending.
- [ ] tests/site-smoke.test.ts dynamic-list block still passes: after #dl-add the list has 2 rows and the count reads 2 (now driven by on-rendered in the fallback path); the delete and undo flows keep their row-count and count assertions.

## Verification

On the committed tree, `pnpm run build && pnpm test && pnpm run check` all pass. Concretely: the renderable suite passes both with and without a fake startViewTransition installed (fallback and wrapped paths); the site-smoke dynamic-list block still asserts row counts and the counter after add/delete/undo via on-rendered; the docs-sidebar test passes with the new renderable section; the four-homes parity test passes; `pnpm check` (tsc --noEmit) is clean under the strict tsconfig (no any, exactOptionalPropertyTypes, noUncheckedIndexedAccess).

## Prohibited Patterns

- Do not touch storable or requestable: only registry/behaviors/renderable/renderable.ts changes among implementations (storable no longer mutates; requestable hands its payload to render).
- Do not let the wrap defer `last` or make `undo()` async: `last` must be assigned synchronously so the one-last-render undo contract holds.
- Do not fire `rendered` for swap `none` or after a thrown slot/id validation error.
- Do not reuse an event name any other implementation claims; the registry rejects the tags-overlap duplicate at import time.
- Do not document the out-of-scope side-by-side visible-container move; it stays unsupported and undocumented.
- No code comments; new code must type-check under the strict tsconfig.
- Do not write scratch work outside the repo (scratch/ allowed, delete before finishing).
