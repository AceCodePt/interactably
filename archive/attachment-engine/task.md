---
wait_human_start: false
wait_human_merge: true
dependencies: [drop-customized-builtins]
---

# Task: Attachment engine: attach(), start(), Attachment record (expand; keep the host)

## Metadata

- **Complexity:** High
- **Priority:** High
- **Status:** Ready for Handoff

## Context

Slice 1 of drop-customized-builtins (brief order 1), expand style: add the attachment engine ALONGSIDE the existing host machinery, which stays fully operational and untouched. attach() excludes on-load (its own slice). New attach.test.ts covers the non-on-load bullets. Baseline 466/466 green on main (632bf3f); see the drop-customized-builtins spec for the model. Old is=/custom-element path is NOT deleted here (next slices).

## Requirements

- [ ] New registry/interactable/attachment.ts: Attachment record (implementations: Map<string, ImplementationInstance>, interactionCleanup: Array<() => void>, attributeObserver, pendingMissing: Set<string>, reportedMissing: Set<string>); attachmentByElement: WeakMap<Element, Attachment>; getAttachment(el); isAttached(el); attach(el); the detach body as a reusable function.
- [ ] attach(el) is atomic, one call, in order: bind one passive listener per on-* attribute (wireTriggers body, including both warnings, minus the name load); syncIntersect(el); the ensure pass reading implements (tag check against def.tags unchanged; missing-name deferral unchanged - _pendingMissing/_reportedMissing on the record); for each implementation call connectedCallback and wire its on* methods; add the interaction listener that is today's onInteraction (auto-wc used to bind it implicitly on the element); install the per-element attribute observer; track the element. No didEnsure.
- [ ] The interaction listener routes a verb to the first implementation in implements order that declares it, validating the arg against the signature and setting handled/error/result as today, warning on a promise return; when an implements name is in _pendingMissing it sets handled=true and error = new NotReadyError(implements, verb).
- [ ] Per-element attribute observer: attributes:true, attributeOldValue:true, NO filter; dispatches by name - one of INTERSECT_ATTRIBUTES -> syncIntersect(el); a name in allObservedAttributes() -> each implementation's attributeChangedCallback; the implements attribute -> re-run the ensure pass (new names attach, removed names are detached individually); an on-* name other than load added or removed -> bind or unbind that one trigger listener (values still read at fire time, so a changed value needs nothing).
- [ ] New registry/interactable/start.ts: start(root = document) - querySelectorAll("*") filtered by the participation rule (implements or any on-* attribute), attach each participant skipping already-attached; one MutationObserver {childList: true, subtree: true} on root; when document.readyState === "loading", defer the initial scan to DOMContentLoaded (once) but install the observer immediately so nothing inserted during parse is attached in the same DCL pass; idempotent per root; returns a dispose function that disconnects the observer.
- [ ] Observer callback: addedNodes - attach any participant without a record; removedNodes - walk the removed element and its descendants, and for each with a record AND not isConnected run the detach body (untrack, disconnect the attribute observer, run the cleanup list, call implementation disconnectedCallbacks, teardownIntersect, clearPhraseState, delete the record). A move (removed then re-inserted in one task) is a no-op because the element is connected when the callback runs.
- [ ] implementation-registry.ts gains additively: attached: Set<Element>, track(el), untrack(el); attach calls track, detach calls untrack. connectedHosts and its path stay untouched this slice.
- [ ] attach.test.ts (new, non-on-load bullets): start() on a document with three participants and two bystanders attaches exactly the three (isAttached); start() while readyState === "loading" - nothing attached until DOMContentLoaded is dispatched, then all of it incl. an element inserted in between; insert after start() -> not attached synchronously, attached after one microtask, and a click() in the gap runs nothing; remove -> detached (listeners gone, clearPhraseState called, intersect torn down, impl disconnectedCallback ran); remove + re-append in the same task -> same implementation instance, no disconnectedCallback; add on-click to an attached element -> next click runs it, remove it -> next click does not; edit implements from "revealable" to "revealable storable" -> storable attached, back -> detached with the revealable instance unchanged; an element inserted without implements/on-* then given on-click -> NOT attached (pins the caveat); dispose from start() disconnects the observer (a later insertion is not attached).
- [ ] Every existing test stays untouched and passes; the old host machinery is unchanged.

## Verification

pnpm check && pnpm test pass on the committed tree with attach.test.ts added and every existing test untouched; test count >= 466 + the attach.test.ts count.

## Prohibited Patterns

- Do not touch dispatch.ts, executor.ts, or the existing connectedHosts path in implementation-registry.ts (behaviour unchanged this slice).
- No on-load in attach() (its own slice).
- Do not delete or alter interactable-host.ts or registry/interactable/host.ts.
- No code comments beyond what the brief requests (AGENTS.md).
