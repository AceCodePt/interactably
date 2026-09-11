---
wait_human_start: false
wait_human_merge: false
dependencies: [interactably-02-host-registry]
---

# Task: Interactably-03-Generic-Impls

## Metadata

- **Complexity:** Medium
- **Priority:** High
- **Status:** Ready for Handoff

## Context

Clean-room implementation slice 3 of the Interactably design (README.md §5.5, §6.1, §8.3, decisions 11.27, 11.28, 11.35). Build the three generic, tag-less implementations every page starts from: no-propagate, prevent-default and revealable, plus the shared bindEvents helper. Depends on interactably-02-host-registry. Tests use node:test with jsdom. If a piece is too large you may create sub-tasks within README scope that depend on this task.

## Requirements

- [ ] Move the add/remove/re-add listener logic from no-propagate into a shared bindEvents(el, events, handler, opts?) in behavior-utils.ts: it parses a comma-separated list of event or event:key entries into (type, key?) pairs, binds one listener per type, checks the key via matchesKey, and re-reads the list in attributeChangedCallback (README §5.5).
- [ ] registry/behaviors/no-propagate/: tag-less, config { events: "string | undefined" } defaulting to click, verbs {}, stopping propagation (README §5.5).
- [ ] registry/behaviors/prevent-default/: tag-less twin of no-propagate with preventDefault(), passive:false, config events derived from the element's own on-submit / on-click / keyed on-keydown phrases restricted to DERIVABLE = {submit, click, keydown}, tag fallback (<form> to submit, <a href> and <button> to click), and a connect-time console.warn when nothing is derivable (README §5.5, §8.3, §11.35).
- [ ] registry/behaviors/revealable/: tag-less, verbs show/hide/toggle over derived strategies (README §6.1): <details> and <dialog> write el.open / showModal(), a [popover] calls showPopover(), anything else uses data-open; config modal for the dialog case; live state read from the platform; ARIA sync sets aria-expanded/aria-controls on e.source where applicable.
- [ ] Tests cover event-list parsing and key matching, derivation of prevent-default events including keyed keydown and the tag fallback, and revealable's four strategy rows.

## Verification

`pnpm check && pnpm test` pass; tests exist for bindEvents, no-propagate, prevent-default (derivation and fallback) and revealable's strategy table.

## Prohibited Patterns

- Never create or write files under /tmp or any system temp directory; do scratch work in <repo>/scratch/ and delete it before finishing.
- Do not add runtime dependencies beyond auto-wc and tsyntax.
- Do not implement value/request/logger or other non-generic implementations in this slice.
