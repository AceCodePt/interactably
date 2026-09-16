---
wait_human_start: false
wait_human_merge: false
dependencies: []
---

# Task: Remove spyable; the docs sidebar becomes a push (on-intersect + attributable + hashable)

## Metadata

- **Complexity:** Medium
- **Priority:** Medium
- **Status:** Ready for Handoff

## Context

`spyable` (registry/behaviors/spyable/) is a watcher: it observes scroll on a nav, queries `a[href^="#"]` inside it, and derives `data-active` + `aria-current="location"` for whichever target is in view. That is the pull shape this library deliberately does not have — every phrase is a push from the element the event happened on to the elements it names, as the README's "When not to use this library" section now states. `on-intersect-*` (Task C) plus `attributable`/`hashable` (Task E) already cover the use case in the push shape: the docs sidebar's single `data-current` value is set by each heading as it crosses the viewport's middle line, so it is one-at-a-time by construction and nothing ever needs clearing. This task removes spyable entirely and rewrites the docs sidebar with that pattern. No dependencies; no other open tasks.

## Requirements

- [ ] Delete `registry/behaviors/spyable/` (spyable.ts and spyable.test.ts).
- [ ] Remove the `spyable` export at src/index.ts:17 and the `"spyable"` entry at rolldown.config.mjs:25; remove `import "./vendor/spyable.js";` at site/demo.js:17.
- [ ] Remove every spyable reference from docs: the Shipped-implementations table row (README.md:281, site/docs.html:430), the trailing sentence "The `spyable` implementation, which tracks *which* section is in view, remains the tool when a one-at-a-time current-section marker is needed." at README.md:776 and site/docs.html:899 (delete that sentence only; the rest of the paragraph stands), the spyable entry in the API-reference implementations list (README.md:806, site/docs.html:927), and the spyable ref card at site/reference.html:183-191.
- [ ] site/docs.html: the nav at line 42 becomes `<nav id="toc" aria-label="Documentation sections" implements="attributable">` (drops `spyable-offset`, gains `id="toc"`; it keeps upgrading through the auto-loader as today — no `is=` added).
- [ ] Every heading the nav links to (32 targets: the ids at site/docs.html:43-74, all `<h2 id>`/`<h3 id>`, no sections exist) gains `is="interactable-h2"` (or `-h3")`, `implements="attributable hashable"`, and `on-intersect-half="0px 0px -50% 0px: #toc.setAttr({name: 'data-current', value: '<id>'}); this.hash()"` (the heading's own id). The anchor links inside the headings stay untouched.
- [ ] site/demo.js: add `defineInteractableHost("h2")` and `defineInteractableHost("h3")` so the customized built-in headings upgrade (the site smoke test picks both up via its EXTRA_HOST regex over demo.js).
- [ ] site/styles.css: replace the `.sidebar nav a[data-active]` rule (line ~261) with one rule whose comma-grouped selector list has one entry per link — `.sidebar nav[data-current="<id>"] a[href="#<id>"]` for all 32 ids — carrying the same styling (color: var(--fg); background: var(--surface-3); border-left-color: var(--accent)). CSS cannot compare an attribute value to another element's `href`, so the 32 selectors are unavoidable; this is the same tradeoff as the tabs example.
- [ ] Add a code comment in site/docs.html where the pattern is introduced noting the known imperfection: the trigger fires on every crossing of the middle line in both directions; scrolling down is exact, scrolling up the heading that crosses back below the line re-sets `data-current` to itself until the previous heading crosses — the honest behaviour of a push design with no leaving-side distinction (Task C decision); no direction guard is added to fix it.
- [ ] In the scroll-spy section of site/docs.html (~line 878, where the deleted spyable sentence was) add one sentence pointing at the live sidebar as the one-at-a-time current-section marker in the push shape (the nav holds one `data-current`, set by each heading's `on-intersect-half`).
- [ ] Commit message notes the loss of `aria-current="location"` on the active link: with one attribute on the nav it is not reachable from CSS, and per-link writing would need each heading to clear the previous link's attribute — the exclusivity problem; the visible highlight plus the document's own heading structure is adequate for a docs sidebar.
- [ ] Tests: delete `spyable.test.ts`; in tests/site-smoke.test.ts remove `"spyable"` from KNOWN_BUNDLES (line ~30) and add a docs.html section — inject the docs body into a holder, install the fake IntersectionObserver (from tests/intersection-observer.ts) BEFORE the bundles import so headings' connectedCallback attaches observers, import the bundles and define the extra hosts (h2/h3 now included), then assert: the sidebar nav has `id="toc"` and `implements="attributable"`; at least one heading carries an `on-intersect-half` phrase naming `#toc`; trigger the fake observer (a synthetic `ImplementationEvent` crossing via `FakeIntersectionObserver.trigger`) on one heading and assert `#toc` gets `data-current` equal to that heading's id; and the docs body loads without console.warn/console.error. The existing vendor-ref machinery already covers "no spyable bundle referenced" once the demo.js import is gone.
- [ ] `pnpm check` and `pnpm test` pass on a built tree (the site smoke test skips when dist/cdn is not built, as today).

## Verification

`rg -n "spyable" --glob '!archive/**' .` returns nothing outside archive/. `pnpm check` and `pnpm test` pass on a built tree (pnpm build first), including the new docs.html smoke-test section: the nav carries `id="toc"` + `implements="attributable"`, a synthetic IntersectionObserver trigger on a heading sets `#toc[data-current]` to that heading's id, and the docs body loads with no console warnings. site/demo.js defines the h2 and h3 hosts.

## Prohibited Patterns

- No direction guard, no "leave" trigger, no nav-level observer, and no implementation that finds its targets by querying the DOM.
- Do not reintroduce `aria-current` via per-link clearing (the exclusivity problem); the loss is noted in the commit message instead.
- No changes to the parser, executor, or intersect module.
- Do not touch the connect-time visibility behaviour of revealable (review item 4).
- No `site/vendor/` edits — it is gitignored build output; the source change is the demo.js import.
