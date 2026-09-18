---
wait_human_start: false
wait_human_merge: true
dependencies: [attachment-engine]
---

# Task: Migrate the test suite to start()/isAttached; executor and dispatch single message

## Metadata

- **Complexity:** Medium
- **Priority:** High
- **Status:** Ready for Handoff

## Context

Slice 2 of drop-customized-builtins (brief order 2). Migrate the whole test suite onto the new attachment path and switch dispatch/executor/registry to it. The old machinery (interactable-host.ts, auto-loader.ts, host.ts) stays PRESENT but unused by tests - deletion is the next slice. Baseline green at main; attach()/start()/isAttached exist from attachment-engine. See the drop-customized-builtins spec for the model.

## Requirements

- [ ] All test files that call defineInteractableHost in before() or construct host elements via document.createElement(tag, { is: "interactable-<tag>" }) migrate: before() calls start() once (imported from the new module; exported by src/core.ts if needed) and after() calls the returned dispose; hostElement()-style helpers drop { is } and instead createElement + append + await flush() (tests/jsdom.ts already exports flush); tests that asserted synchronously-after-insertion now flush first.
- [ ] registry/behaviors/interactable-host.test.ts is retired/re-expressed: its host-element tests move to attachment semantics (or into attach.test.ts); the DCL-defer tests (modifiable initial compute, connect-then-disconnect while pending, reconnect-while-pending, the storable DCL restore tests) are re-expressed under start(); the move test flips to move-is-a-no-op; the registry-refresh test targets the attached set; all didEnsure references are removed.
- [ ] dispatch.ts: isHost -> isAttached; the non-host throw becomes "<subject> is not attached: it has no implements or on-* attribute, or start() has not run" (subject = #id or localName as today).
- [ ] executor.ts walkUnit: the three is=-shaped branches collapse to one logOnce call using isAttached with the same one-line message; executor.test.ts's three message tests collapse to one.
- [ ] implementation-registry.ts: connectedHosts: Set<InteractableHost> -> attached: Set<Element>; trackConnectedHost/untrackConnectedHost -> track/untrack; registerImplementation drops the defineInteractableHost(tag) loop and instead iterates attached running the ensure pass on each (call through attachment.ts); keeps allObservedAttributes() and the interactably:register dispatch.
- [ ] implementation-registry.test.ts: the "registration defines an interactable-<tag> host, idempotently" test is replaced (registration no longer defines custom elements); _implementation-definition.test.ts: the customElements.get("interactable-*") assertions and the defineInteractableHost idempotency test are removed.
- [ ] registry/utils/auto-loader.test.ts is deleted; the 23 literal is="interactable-<tag>" fixtures (price-calculator, order-form, executor, json-template) are dropped.
- [ ] Test count must not go down net of the deleted auto-loader tests; pnpm check + pnpm test green.

## Verification

pnpm check && pnpm test pass; test count >= 466 minus the auto-loader test count; rg -n 'defineInteractableHost|is="interactable-' tests/ registry/ returns nothing (src may still export the old names until the next slice).

## Prohibited Patterns

- Do not delete the old machinery files (interactable-host.ts, auto-loader.ts, host.ts) - next slice.
- No on-load in attach().
- Do not touch site/ or README.md.
- No code comments beyond the brief's.
