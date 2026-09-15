---
wait_human_start: false
wait_human_merge: false
dependencies: []
---

# Task: Implementations declare the events they emit (on-copy, on-response, on-request-error)

## Metadata

- **Complexity:** Medium
- **Priority:** High
- **Status:** Ready for Handoff

## Context

Every attribute whose value is a phrase must be named `on-*`. Today copyable and requestable hold continuation phrases in config keys (`copyable-after`/`copyable-error`, `requestable-after`/`requestable-error`), violating that. The fix: implementations declare the events they emit, the way they declare verbs; the host treats a declared event name as non-native — its `on-<type>` handler runs only for `ImplementationEvent` instances, and the "has no such event" warning and `warnIfNativeActionLikelyUnwanted` are skipped. This is also the seam Task C (`on-intersect-*`) reuses as a second source for the non-native lookup.

## Requirements

- [ ] defineImplementation accepts `events: readonly string[]` sibling to `verbs` (entries validated as non-empty strings); carried through `ImplementationDef` and `NormalizedImplementationDef`.
- [ ] New `class ImplementationEvent extends Event` in `registry/interactable/implementation-event.ts`: non-bubbling, not cancelable, `readonly originalEvent: Event | undefined`, `readonly key: string | undefined`.
- [ ] One exported lookup in `registry/interactable/events.ts` (`isImplementationEvent(el, type)`): true when `type` is in the synthetic intersect table (added by Task C) or when any implementation named in the element's `implements` declares `type` in its `events`. Resolved at dispatch time, not baked in at connect.
- [ ] `wireTriggers` in `interactable-host.ts` (lines ~138-155): the per-attribute handler returns unless the event is non-native or `ev instanceof ImplementationEvent`; the `has no "<type>" event` warning and `warnIfNativeActionLikelyUnwanted` are skipped for non-native names.
- [ ] `registerImplementation` rejects a definition whose event name collides with an existing definition when their `tags` overlap (a tag-less side counts as any tag).
- [ ] `copyable`: `events: ["copy"]`; config drops `after` and `error`; on successful `copy()`, `if (el.isConnected) el.dispatchEvent(new ImplementationEvent("copy", { originalEvent: e.originalEvent }))`; the failure path warns and dispatches nothing.
- [ ] `requestable`: `events: ["response", "request-error"]`; config drops `after` and `error`; after a successful swap `if (el.isConnected) el.dispatchEvent(new ImplementationEvent("response", { originalEvent: e.originalEvent }))`; on network failure or non-2xx `if (el.isConnected) el.dispatchEvent(new ImplementationEvent("request-error", { originalEvent: e.originalEvent }))`.
- [ ] `src/core.ts` exports `ImplementationEvent` and `isImplementationEvent`; `rolldown.config.mjs` coreFiles gains `registry/interactable/implementation-event.ts`.
- [ ] Tests: `on-copy` runs after `copy()`; a native `copy` event on the same copyable element does not run the phrase; a native `copy` on a non-copyable element does; `on-response` / `on-request-error` fire in their branches; `implements` added after wiring is respected at dispatch time; the registry rejects a same-tag event collision.
- [ ] Docs sweep: rename `copyable-after` -> `on-copy`, `requestable-after` -> `on-response`, `requestable-error` -> `on-request-error` across README.md and site/*.html (delete `copyable-error` references; copyable's failure path only warns); rewrite the continuation-phrase convention bullet, the Asynchrony section, the requestable core snippet and the "Why not a general `<name>-after` convention" bullet; the trigger reference gains an "implementation events" category with the sentences "on a copyable element `on-copy` is copyable's event and the native clipboard event doesn't fire it" and "continuations now share trigger-attribute once/debounce semantics"; reference.html copyable/requestable cards list the declared events.

## Verification

`pnpm check` and `pnpm test` pass on the committed tree, including the updated copyable/requestable/registry/host tests. The renamed config keys no longer appear in README.md or site/*.html: `rg -n "copyable-after|copyable-error|requestable-after|requestable-error" README.md site/*.html` returns nothing outside archive/.

## Prohibited Patterns

- Do not touch revealable, the parser, the executor, or intersect.
- Do not keep the `after`/`error` config keys on copyable or requestable.
- Do not introduce a `copyable-error` event name; the copyable failure path only warns.
- Do not treat the non-native decision as cached at connect; resolve it at dispatch time.
