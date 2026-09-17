---
wait_human_start: true
wait_human_merge: false
dependencies: []
---

# Task: Drop customized built-ins: attach through one document observer (spec)

## Metadata

- **Complexity:** High
- **Priority:** High
- **Status:** Ready for Handoff

## Context

The library stops using is="interactable-<tag>", the auto-wc dependency and the @ungap/custom-elements polyfill. Elements are found by one MutationObserver and attached by a plain function. Why: WebKit will not implement customized built-ins (standards-position #97; #722 "Round 2" closed as a duplicate 2026-09-17 with the WHATWG sanitizer maintainer's objection). The is= polyfill is permanent infrastructure on Safari, "synchronous on insertion" is true on two engines and false on one, and the pairing reads as fragile to the generators the project targets. The replacement gives up synchronous-on-insertion everywhere, by design, for one timing rule identical on every engine.

Baseline: HEAD 632bf3f on main (past 8960a8b). host-defer-connect-ready (45cd447) already implements the DCL-defer guard; dirtyable-events-baseline+impl (245118c, 61cfe4f) already moved dirtyable to the platform default with dirty/clean events; intersect-preserve-state-across-rebuild (fa3df30) landed. Working tree clean, pnpm check clean, 466/466 tests pass after pnpm build. tasks/ empty; archive/host-defer-connect-ready/task.md is the archived spec to mark superseded.

Rulings made in conversation: (D1) storable keeps storable-value ONLY - match semantics, no write direction, no storable-target; the storage-driven <img storable-key="avatar"> src case is out of scope (document as on-restore on a matching element doing #avatar.setAttr with a literal). (D2) the examples.html "Same interaction, two ways" demo collapses to one ordinary example. (D3) NotReadyError fires only when a dispatch reaches an attached element whose implements names an implementation still pending registration (pendingMissing); a reported tag-mismatch name stays a quiet skip.

Lands as ONE PR with several commits; the README rewrite is the largest commit and must land in the same PR. Slices are sequenced by dependencies; the human holds merges (wait_human_merge: true on slices). Each slice leaves pnpm check + pnpm test green on its branch.

## Requirements

- [ ] An element participates when it has implements, any on-* attribute, or both; nothing else is required - no is=, no per-tag definition, no id unless addressed. start(root = document) exported from core: idempotent per root, returns a dispose; scans once and attaches every participant; one MutationObserver {childList:true, subtree:true}; when document.readyState === "loading" the initial scan defers to DOMContentLoaded (once) but the observer installs immediately so nothing inserted during parse is missed; dispose disconnects the observer.
- [ ] Timing rule, one sentence, on every engine: the initial document is live at DOMContentLoaded; anything inserted later is live one microtask after insertion. A programmatic .click() in the gap runs nothing - documented cost, pinned by a test.
- [ ] attach(el) is atomic: bind one passive listener per on-* attribute (wireTriggers body, both warnings, minus load); syncIntersect; instantiate implementations from implements (tag check + missing-name deferral unchanged); connectedCallback; wire on* methods; add the interaction listener (today's onInteraction); per-element attribute observer; track. No didEnsure window. Instance fields move to an Attachment object in a module-level WeakMap<Element, Attachment>; getAttachment/isAttached replace isHost; IS_HOST dropped.
- [ ] Detach walks removedNodes: each removed element/descendant with a record and not isConnected runs today's disconnectedCallback body (untrack, disconnect attribute observer, cleanup list, impl disconnectedCallbacks, teardownIntersect, clearPhraseState, delete record). addedNodes skips recorded elements. A move (remove+re-insert in one task) is a no-op - instances survive; say so in the README.
- [ ] dispatch.ts and executor.ts (l.150-176) switch to isAttached; three is=-shaped messages collapse to one: "<ref> is not attached: it has no implements or on-* attribute, or start() has not run".
- [ ] on-load means attach, unconditionally: fires once per attach, after that element's implementations are instantiated; a <template> is inert (a clone's on-load fires once on insertion); a move does not re-fire. Two passes: the start() scan and each observer callback attach the whole batch first, then fire the batch's on-load phrases in document order (so <button on-load="#panel.open()"> ahead of #panel resolves) - pinned by a test. It is the one on-* that is not a DOM listener (attach reads the attribute, calls runPhrases(el, ..., new ImplementationEvent("load"))); wireTriggers skips the name load; the attribute add/remove handler ignores it. The native load event is unreachable through the DSL; no on-native-load.
- [ ] Attributes on an attached element are live: per-element observer (attributes:true, attributeOldValue:true, NO filter) dispatches by name - config/state attribute -> that implementation's attributeChangedCallback; INTERSECT_ATTRIBUTES -> syncIntersect; implements -> re-run the ensure pass (new names attach, removed names detach individually); an on-* attribute added/removed -> bind/unbind that one trigger (values read at fire time). The document-level observer never watches attributes. Single caveat: participation is decided at insertion (or start()); an element that gains implements/on-* later is not attached - re-insert it; documented as the one caveat.
- [ ] Registry: connectedHosts: Set<InteractableHost> -> attached: Set<Element>; trackConnectedHost/untrackConnectedHost -> track/untrack; the interactably:register re-run iterates attached and runs the ensure pass on each; allObservedAttributes() kept for the attribute handler.
- [ ] Removed: defineInteractableHost, InteractableHost type, installAutoLoader, registry/utils/auto-loader.ts, the auto-loader.js bundle + rolldown entry, the auto-wc dependency, every @ungap/custom-elements mention, the auto-loader assertions in tests/site-smoke.test.ts. src/core.ts exports start; src/index.ts drops the installAutoLoader line. Implementations keep tags. Not changing: defineImplementation, signatures, ImplementationEvent, intersect/measure/keys/parser/executor internals (beyond the one message), dispatchInteraction's contract, every factory; runPhrases(this, ...) unchanged.
- [ ] storable (D1): storable-key and storable-value both required (drop | undefined so bindAttributes throws at attach naming the attribute); verbs save/restore/clear (load renamed restore); delete key/name/id fallback + warning, .value fallback + warning, the checkable same-name JSON-array branch, connectedCallback restore, DOMContentLoaded deferral, pendingReady, disconnectedCallback. restore event fires at most once per restore() call, only when applied or matched, never from save(); no stored value fires nothing. Nothing restores without on-load="this.restore()".
- [ ] dirtyable: markClean deleted (baseline is the platform default; moved via this.setAttr({name:'value', value:this.value}) - parser already accepts property reads in object literals, no parser change; after a restore: on-restore="this.setAttr({name:'value', value:this.value})"); subscribes to the per-element attribute observer for value and checked, re-evaluating when the default moves (dirty/clean on transition); one sentence that a textarea/select baseline cannot move via setAttr and gets no mechanism in this PR.
- [ ] Docs (README + site): host, is=, auto-wc, @ungap, upgrade, auto-loader, customized built-in and every Safari sentence leave reader-facing text; the README is rewritten not patched and lands in the same PR; no "now works in Safari" anywhere; the end-grep (is=, interactable-, host, Host, upgrade, auto-loader, ungap, auto-wc, Safari, customized) over README.md + site/ leaves only deliberate hits; docs.html/reference.html mirror the README; #hosts -> #attachment. Site: demo.js calls start(); all 335 is= stripped; examples.html two-ways demo collapses (D2); site-smoke loads with start() and greps site/ for is=" and interactable- with zero hits.
- [ ] Verification baseline: pnpm check, pnpm build, pnpm test, pnpm build:site all pass on the committed tree; net test count not below 466 minus the deleted auto-loader tests.

## Verification

On the committed tree: pnpm check && pnpm build && pnpm test && pnpm build:site all pass; pnpm test reports no fewer than 466 tests net of the deleted auto-loader suite; rg -n 'is="interactable-|interactable-' site/ returns nothing; the end-grep over README.md + site/ leaves only deliberate hits; tests/site-smoke.test.ts passes with start() and no is= anywhere in site/.

## Prohibited Patterns

- Do not leave the README describing a mechanism the code no longer has at any merged state (one PR, doc slice last).
- Do not add a browser-support or "works in Safari" section anywhere.
- No code comments beyond what the brief explicitly requests (AGENTS.md).
- Do not touch interactable-protocol.md or the review files (history stays).
- Do not introduce storable-target or any write-direction storable.
