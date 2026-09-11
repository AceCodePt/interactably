---
wait_human_start: false
wait_human_merge: false
dependencies: [interactably-01-core]
---

# Task: Interactably-02-Host-Registry

## Metadata

- **Complexity:** High
- **Priority:** High
- **Status:** Ready for Handoff

## Context

Clean-room implementation slice 2 of the Interactably design (README.md §5, §6, §7, §9.2 host/registry/auto-loader, decisions 11.20, 11.25, 11.26, 11.32, 11.33). Build the implementation definition contract, the typed attributes proxy, the host mixin that wires triggers and routes interactions, the registry, and the auto-loader. This depends on the pure core from interactably-01-core. No concrete implementations ship in this slice; the generic ones arrive next. Follow the README paths (registry/interactable/, registry/behaviors/). Tests use node:test with jsdom. If a piece is too large you may create sub-tasks within README scope that depend on this task.

## Requirements

- [ ] registry/behaviors/_implementation-definition.ts exports defineImplementation(name, { tags?, config?, state?, verbs }, factory) with the El<T>, Slot, Sig, ArgOf<S>, Attrs<C,S> and Implementation<V> types from README §5.3; scalar signatures are tsyntax strings validated at compile time (DSLValidate) and runtime, element signatures are constructors, tags resolve through HTMLElementTagNameMap, and the factory is type-checked against verbs in both directions.
- [ ] defineImplementation throws at definition time on a malformed declaration (a verb in verbs with no factory method, a state key with a conflicting signature, an empty observed-attribute union) as described in README §5.1 Reporting and §11.33.
- [ ] registry/interactable/attributes.ts exports bindAttributes(el, name, def): a typed live proxy where config keys are read-only getters over <name>-<key> and state keys are getters/setters over data-<key>, each value validated through the same compiled slot as verbs (README §5.4, §6).
- [ ] registry/behaviors/interactable-host.ts exports defineInteractableHost(tag) building interactable-<tag> through auto-wc, and the host wires triggers by scanning getAttributeNames() for on-* in connectedCallback, binding one passive listener per attribute on itself, warning on unknown event types using LEGACY_EVENTS_WITHOUT_IDL, and cleaning up on disconnect (README §5.1).
- [ ] The receiver side reads implements, tag-gates each name against the definition's tags (mismatch is a console.error naming element, implementation and tags, and is skipped), lazily ensures implementations, wires implementation on* methods and forwards lifecycle callbacks, and routes onInteraction(e) to the first implementation in implements order that declares the verb, validating e.arg against the verb signature and setting handled/error/result (README §5.1, §9.2).
- [ ] Readiness is reported, never awaited (README §5.1 Readiness, §11.32): an interaction arriving before didEnsure sets handled=true and error=NotReadyError; nothing is queued.
- [ ] registry/behaviors/implementation-registry.ts (plus behavior-utils.ts if used) exports registerImplementation/getImplementationDef/ensureImplementation and getObservedAttributes returning config keys as <name>-<key> plus state keys as data-<key>; registration calls defineInteractableHost for each declared tag idempotently and throws when a state key is registered by another definition with a different signature (README §5.4, §9.2).
- [ ] registry/utils/auto-loader.ts adds is=interactable-<tag> to elements with implements or any on-* attribute using the node-replacement strategy, is opt-in, logs one console.info per page, and documents the microtask-late upgrade and focus loss (README §9.2).
- [ ] Tests with jsdom cover on-* binding, listener cleanup, implements routing and ordering, tag gating, NotReadyError, the handled/error/result channels, the attrs proxy, registry host-ensuring, and the auto-loader.

## Verification

`pnpm check && pnpm test` pass; host/registry/attributes/auto-loader tests exist and exercise the trigger binding, interaction routing, tag gating, readiness, return channels, and attrs proxy described in README §5.

## Prohibited Patterns

- Never create or write files under /tmp or any system temp directory; do scratch work in <repo>/scratch/ and delete it before finishing.
- Do not add runtime dependencies beyond auto-wc and tsyntax.
- Do not implement no-propagate, prevent-default, revealable or any other concrete implementation in this slice.
- Do not carry over any Command Protocol code (command attribute/event, _wireCommandDispatch, dispatchCommand, uniqueBehaviorDef, TypeBox) from behavior-fn.
