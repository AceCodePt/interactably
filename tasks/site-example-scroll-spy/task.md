---
wait_human_start: false
wait_human_merge: false
dependencies: []
---

# Task: Site example — a scroll spy, the first page to teach on-intersect

## Metadata

- **Complexity:** Low
- **Priority:** Medium
- **Status:** Ready for Handoff

## Context

`on-intersect` is used by no example page. site/docs.html uses it seventy-five times — every section lights its own sidebar link with `on-intersect(state:\`enter\`,block-start:\`-#topnav.height\`)` and darkens it on `leave` — but that is the docs' own furniture, not something a reader is shown as a pattern to copy. reference.html and docs.html describe the event; nothing demonstrates it. site-grammar-refresh records this as docs-only and defers the page to this task.

The subject is the common use, not the exotic one. Lazy-loading images is native (`loading="lazy"`) and must not be shown as something the library does; fetching content on approach is requestable's business and out of scope here. The pattern nearly every long page has is the one the docs page itself uses: a table of contents whose current entry follows the reader as they scroll. That is the page.

Intersect shipped as one event with named slots (`4664f1a`), and this page should show each slot doing its one job so an author can see the whole surface once:
- `state:\`enter\`` / `state:\`leave\`` — the current-section link lights and unlights. This is the core of the page.
- `block-start:\`-#header.height\`` — the page has a sticky header, so the observation box must start below it, and the margin is a reference to the header's measured height rather than a magic number. Prose explains that an omitted margin slot is `0px`, and that the slot names are logical (`block-start`, not `top`) while the platform is physical, so the library maps them from the element's writing mode.
- `full:\`true\`` — used exactly once, for something that should only happen when a section is entirely on screen: a "read" mark appears next to the section's TOC entry the first time the whole section has been in view. Prose says why `full` is a boolean slot and not a third `state` — it fires on every change of fullness in either direction.

Keep it a widget page in the established shape. Four or five short sections of real prose (about the library is fine; not lorem ipsum), a sticky header, a sidebar TOC with one link per section. Single-column on narrow viewports with the TOC above the content — check what the docs page does and follow it.

What this page is expected to record in the handoff:
- Whether the docs page's own scroll-spy markup and this page's stay in step, or whether the docs page uses a shape the example does not (and which should change).
- Whether `-#header.height` behaves when the header's height changes at a breakpoint — the intersect commit documents that a runtime writing-mode change does not rebuild observers; note whether a height change does.
- Whether `full` is teachable in one sentence or needs more; if it needs more, that is a docs finding.
- The initial state: which link is lit before any scrolling, and whether the observer's initial callback (which the docs say fires `enter` for elements already intersecting) does the right thing without a page-load phrase.

## Requirements

- [ ] site/examples/scroll-spy.html following the established page furniture; page ids prefixed (spy-) with the snippet free to use short ids.
- [ ] A sticky header, four or five sections, and a TOC whose current link follows the reader via `state` enter/leave.
- [ ] `block-start` set from the header's height by reference, with prose explaining the logical slot names and the `0px` default.
- [ ] `full:\`true\`` used exactly once, with prose explaining why it is a boolean slot.
- [ ] Correct initial state on load with no page-load phrase.
- [ ] The lede names the subject plainly: a current-section indicator, the same thing the docs page's sidebar does.
- [ ] Registered in site/examples.html with blurb and tags in the established shape; the snippet matches the live demo markup up to the id prefix and passes the parity check added by site-grammar-refresh if it has landed.
- [ ] The handoff records the findings above and any new one.

## Verification

On the committed tree: pnpm run build then pnpm test and pnpm run check all pass, including the site-smoke example-listing test. Under the demo.js build: scrolling lights each TOC link as its section's top passes below the header and unlights it as it leaves; a section that has been fully in view gains its read mark and keeps it; the first section's link is lit on load; the page produces no console.warn or error. The handoff lists the findings.

## Prohibited Patterns

- No new grammar, slots or events; a gap is a finding.
- No lazy-loading of images or content; no requestable on this page.
- No JavaScript in the page beyond the existing demo.js build; no scroll listeners.
- No magic-number margins where a reference to a measured element is available.
- No phrase-level key prefix.
- No /tmp scratch work; any scratch lives in <repo>/scratch/ and is deleted before finishing.
- No code comments unless requested.
