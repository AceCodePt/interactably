---
wait_human_start: false
wait_human_merge: false
dependencies: [attachment-impls]
---

# Task: README rewrite + docs.html/reference prose + archive note

## Metadata

- **Complexity:** High
- **Priority:** High
- **Status:** Ready for Handoff

## Context

Slice 7 of drop-customized-builtins (brief orders 7-8), the largest commit and the last. Pure reader-facing docs: README.md is rewritten (not patched) so host, is=, auto-wc, @ungap, upgrade, auto-loader, customized built-in and every Safari sentence leave it; docs.html/reference.html finish mirroring; the archived host-defer-connect-ready spec is marked superseded. No behavior change - pnpm test must stay green untouched. Baseline green at main; the site slice already renamed Hosts->Attachment, collapsed quick start, fixed the API/dynamics/why/when-not/not-supported/appendices prose; this slice finishes the implementations-table prose and the storable/dirtyable paragraphs and polishes on-load wording. See the drop-customized-builtins spec for the full section-by-section README requirements.

## Requirements

- [ ] README.md is rewritten, not patched. New first line: "A declarative interaction language for plain HTML elements."; the is= intro paragraph is replaced (an on-* attribute makes a trigger; implements makes a receiver; one start() call finds them); both intro code samples lose is=; the "Every participating element is a host" bullet becomes attached; the "No engine" bullet is rewritten to acknowledge the one observer.
- [ ] Quick start: Options A and B collapse into one sample with start(); the bundle table drops the auto-loader row and the core row reads "parser, executor, event, attachment, registry"; the is= rule callout becomes the participation rule.
- [ ] Hosts -> "Attachment": opening (what start() does, the observer, the timing rule in one sentence); the trigger-side block is introduced via attach() scanning its on-* attributes and is kept verbatim; "A trigger is live the moment it connects" -> "A trigger is live one microtask after insertion, or at DOMContentLoaded for the initial document"; the "adding a brand-new on-* attribute after connect requires re-inserting" sentence is deleted and replaced with the participation caveat; the receiver side is unchanged in substance; the readiness paragraph is rewritten around atomic attach with the one per-element attribute observer (delete the observedAttributes sentence); the four-kinds table is stripped of is=; reporting unchanged. One paragraph after the timing rule describes on-load (what it fires on, fires after implementations, the two-pass guarantee, the template point, the <img> sentence); add on-load to the constructs table if there is a natural place.
- [ ] Dynamics: row 1 -> "Rows cloned from a template are attached one microtask after insertion; on-click="this.remove()" / #list.removeRow(this) works on every clone with no generated ids."; delete the upgrade-timing anchor paragraph and both bullets; replace with "Timing is uniform." (the rule, the one cost - a programmatic .click() in the microtask gap runs nothing, await a microtask or use dispatchInteraction - the move-is-a-no-op note, the participation caveat).
- [ ] API reference: delete the defineInteractableHost and installAutoLoader rows; add start(root?) - "Attach every participant under root and watch it for insertions and removals; idempotent per root; returns a dispose function. Defers the initial scan to DOMContentLoaded when called during parse."; NotReadyError row reworded to "...reaches an attached element whose implements names an implementation that has not registered yet."; drop the auto-loader.js preamble sentence.
- [ ] Why: "Triggers are hosts, not delegated" -> "Triggers are attached, not delegated." (one place decides anything about an element; cost: one MutationObserver on the document and a microtask between insertion and liveness) plus a new bullet "Uniform timing over synchronous-somewhere." When not: "a component library built on the same is= hosts" -> "on the same elements".
- [ ] Not supported: delete "dynamic on-* attribute names after connect" and the CLI is= check; add "attaching an element that gains implements/on-* after insertion (re-insert it)"; delete the on-load paragraph and its "author the initial state instead - open, checked, revealable-open" workaround, replacing with: "the native load event. on-load always means attach, including on <img>, <iframe>, <body>, <link>, <script>; bytes-arrived is addEventListener('load', ...)".
- [ ] Implementations prose: the table rows (dirtyable: no verbs, config dirty-on, events dirty/clean, "compares the element's current value with its platform default; fires on transition"; storable: verbs save/restore/clear, config scope, key, value (both key and value required), "persists a declared slot under a declared key; restore() reads it back and fires restore"); the storable paragraph is rewritten around the declared slot and on-load="this.restore()", with the package-manager example gaining on-load on each button; the "Restore waits for the document to finish parsing ... on-restore="this.markClean()"" paragraph is replaced wholesale; the dirtyable no-state example is rewritten around exactly one boolean (last reported) and the setAttr-baseline move; the "Why not data-dirty?" answer changes to: dirty is a comparison of two platform values the implementation makes on demand and reports as events; the author writes data-dirty in on-dirty/on-clean if a stylesheet wants it.
- [ ] Alternatives: the delegation entry is rewritten honestly (the observer is now paid for; the answer is the ancestor walk per event, the non-passive-listener problem, the supported-events list, and that binding on the element keeps this/passive/one-place-decides); "Why not autonomous wrapper elements instead of is=?" becomes "Why not customized built-in elements (is=)?" (the first design; WebKit's position - #97, #722 closed 2026-09-17 with the sanitizer objection - makes them permanently polyfilled on one engine, and a polyfilled foundation is disqualifying for a library whose premise is that generators recommend it; the observer gives one timing rule instead of two); add the forward pointer: "The platform direction that matches this design is custom attributes for all elements (WICG/webcomponents#1029); when it ships, start() becomes a shim."
- [ ] docs.html and reference.html finish mirroring the README: the implementations-table rows, the storable/dirtyable paragraphs (incl. the slot + on-load package-manager example), and any remaining on-load wording. The end-grep runs over README.md + site/: is=, interactable-, host, Host, upgrade, auto-loader, ungap, auto-wc, Safari, customized - every hit is deliberate (the Alternatives entry, the #topnav/#id intersect examples) or a miss. interactable-protocol.md and the review files stay as history.
- [ ] Mark archive/host-defer-connect-ready/task.md as superseded by this change (one-line note).
- [ ] pnpm check, pnpm build, pnpm test and pnpm build:site all pass with no behavior change.

## Verification

pnpm check && pnpm build && pnpm test && pnpm build:site pass; the end-grep over README.md + site/ leaves only deliberate hits; rg -n 'works in Safari|browser-support' README.md site/ returns nothing.

## Prohibited Patterns

- No code changes - docs only, plus the one-line archive note.
- Do not write "now works in Safari" or add a browser-support section.
- Do not resurrect is=/host/upgrade/auto-loader in reader-facing text; the end-grep must leave only deliberate hits.
- No code comments (AGENTS.md).
