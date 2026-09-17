---
wait_human_start: false
wait_human_merge: true
dependencies: [attachment-remove-old]
---

# Task: Site: demo.js start(), strip every is=, attachment prose

## Metadata

- **Complexity:** High
- **Priority:** High
- **Status:** Ready for Handoff

## Context

Slice 4 of drop-customized-builtins (brief order 4). The site moves to start() and loses every is=; reader-facing prose reflects attachment. The README and the storable/dirtyable prose are later slices - do NOT rewrite those here. on-load does not exist yet in the code, so the site must not USE it (its prose may describe it; the doc slices own wording). Baseline green at main; start() exported from attachment-remove-old.

## Requirements

- [ ] site/demo.js: replace the defineInteractableHost imports + eight calls and the installAutoLoader import with: import { start } from "./vendor/interactably-core.js"; start();. scripts/build-site.mjs needs no change (auto-loader.js simply disappears from dist/cdn).
- [ ] Strip every is="interactable-…" from site/docs.html (135), site/index.html (23), site/examples.html (175), site/reference.html (1), site/fragments/quote.html (1). Sidebar toc-* links keep implements="attributable"; the 30 spy sections keep on-intersect-*; both remain participants automatically.
- [ ] examples.html "Same interaction, two ways" (ex-auto; demo-auto/demo-is tabs; auto-demo-btn/auto-demo-panel; is-demo-btn/is-demo-panel): collapse to one ordinary toggle-panel example per ruling D2; the auto-loader tab and its code sample are deleted.
- [ ] docs.html prose: quick-start two tab panels collapse to one sample with start(); the bundle table drops the auto-loader row and the core row reads "parser, executor, event, attachment, registry"; the is= rule callout becomes the participation rule; the Hosts section becomes Attachment (what start() does, the observer, the timing rule in one sentence; trigger-side block introduced via attach() scanning on-* attributes; "A trigger is live the moment it connects" -> "one microtask after insertion, or at DOMContentLoaded for the initial document"; the "adding a brand-new on-* attribute after connect requires re-inserting" sentence is deleted and replaced by the participation caveat); Dynamics (delete the upgrade-timing anchor paragraph and both bullets; replace with "Timing is uniform." incl. the microtask-gap cost, the move-is-a-no-op note, the participation caveat); API reference (delete defineInteractableHost and installAutoLoader rows; add start(root?); reword NotReadyError; drop the auto-loader.js preamble sentence); Why ("Triggers are hosts, not delegated" -> "Triggers are attached, not delegated" plus the new "Uniform timing over synchronous-somewhere" bullet); When not ("on the same is= hosts" -> "on the same elements"); Not supported (delete dynamic on-* names after connect and the CLI is= check; add "attaching an element that gains implements/on-* after insertion (re-insert it)"; delete the on-load paragraph and its "author the initial state" workaround, replacing with the native-load sentence); Appendices.
- [ ] The <h2 id="hosts"> anchor and the #toc-hosts link become attachment / #toc-attachment; check fragments/ and any inbound href="#hosts".
- [ ] reference.html mirrors the API table (delete the two rows, add start, reword NotReadyError).
- [ ] tests/site-smoke.test.ts: both tests load the site fixture with start() (importing demo.js or calling core.start()); the auto-loader import/assertion and EXTRA_HOST machinery are removed; KNOWN_BUNDLES has no auto-loader; the auto-demo assertions (l.196-203) and the demo-auto/demo-is tab assertions (l.367-374) are reworked to the collapsed example; a new assertion greps site/ for is=" and interactable- and asserts zero hits.
- [ ] pnpm build, pnpm build:site, pnpm check and pnpm test all pass.

## Verification

pnpm build && pnpm build:site && pnpm check && pnpm test pass; rg -c 'is="interactable' site/ returns 0; rg -n 'installAutoLoader|auto-loader|defineInteractableHost' site/ returns nothing; the site-smoke grep assertion passes.

## Prohibited Patterns

- Do not touch README.md.
- Do not rewrite the storable/dirtyable prose or change markClean/storable semantics (implementation + docs slices).
- No on-load code path or on-load usage in the site.
- No "works in Safari" text; no browser-support section.
- No code comments beyond the brief's.
