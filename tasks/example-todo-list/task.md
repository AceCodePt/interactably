---
wait_human_start: false
wait_human_merge: false
dependencies: [storable-refs-and-restore-filtering]
---

# Task: site example — a to-do list, the first application-shaped example

## Metadata

- **Complexity:** Medium
- **Priority:** Medium
- **Status:** Ready for Handoff

## Context

All thirty examples under site/examples/ are widgets: a character counter, a class toggle, a copy button, roving focus. Most are about five kilobytes — a page with one control on it. None is an application, so nothing yet tests whether phrases compose across a whole screen rather than one button at a time. This is the first of several application-shaped examples (a to-do list, a shop/cart, a search results page) whose purpose is as much to find where the DSL cracks under a real page as it is to document it.

The site is published on GitHub Pages, which is static, so there is no server to POST or DELETE to. HTMX's own docs solve this with a client-side request mock; this example does NOT. Faking a failure so the error-filtering path has something to show would be dishonest — there is no reason to demo a failing case for something that is expected to succeed. site/examples/offline-fallback.html already covers failure, where failure is the actual subject; here the happy path is the subject.

So the seam is drawn honestly: the initial list is a real GET of a static fragment, exactly as network-quote.html already does end to end on this static site, and every mutation after that is local. The lede must say so plainly, the way network-quote's lede names its own constraint. If the examples later outgrow static hosting, a small server on its own domain is the escape hatch, and nothing in this example needs to change to keep working.

Shape:
- A fragment, site/fragments/todos.html, holding a few seeded <li> rows in the same markup shape the template produces. Each row carries its own delete phrase, the way fragments/quote.html carries its own reload button — the trigger arrives with the response, no extra wiring, which is worth calling out in the prose.
- A GET via requestable swaps that fragment into the list on load.
- Adding a row: on-click="#list.render({template: #row-tpl, swap: 'beforeend', title: this.value, id: now()}); #todo-store.save()". The id comes from now(), which exists for exactly this.
- Deleting a row: the template authors <li id="row-{id}"> and a button carrying on-click="#list.render({swap: 'delete', target: '#row-{id}'}); #todo-store.save()". The clone is stamped before attachment so the parser reads an ordinary ref. No walk-up, no row keyword.
- Persistence: a storable whose storable-value is a ref to the list, so save() snapshots the list's innerHTML and restore() puts it back. on-load="#todo-store.restore()" — unfiltered, because the stored value is unbounded.
- Reload is therefore not a lie: what the user added is still there. The GET seeds an empty list; a restore, when there is something stored, is what actually fills it.

Notes for the implementer: this example exists to surface gaps. If a step needs a capability the DSL does not have, do not work around it silently and do not invent grammar: record it plainly in the handoff. A list of "here is where a real page hit a wall" is a more valuable output than a polished page that hides the walls. Empty-state handling — what the list shows before anything is added and after the last row is deleted — is one known likely gap: the library has no conditional rendering, so if it cannot be expressed cleanly, the handoff must say so rather than invent a mechanism; that finding is the point of the example.

## Requirements

- [ ] site/fragments/todos.html with seeded rows matching the template's markup exactly. Any drift between fragment and template shows up as rows that look alike but behave differently.
- [ ] site/examples/todo-list.html following the established page furniture: topnav, examples-back link, doc-title, doc-lede, demo, and the <details> code block with the copy button.
- [ ] The lede states the constraint honestly — initial load is a real request, mutations are local because the site is static. Do not imply a backend.
- [ ] Registered in site/examples.html alongside the others.
- [ ] The shown code block must match the live demo markup. site-smoke.test.ts covers implementation-table parity but NOT example snippets, and the combobox example has already drifted this way — prefer generating the snippet from the demo markup over copying it.
- [ ] Verify restored rows are live: start.ts runs a document-level MutationObserver, so injected markup attaches, but the example is the first to depend on restored markup carrying working phrases. A restored delete button that does nothing is the failure mode to watch for.
- [ ] Empty-state handling: what the list shows before anything is added, and after the last row is deleted. The library has no conditional rendering, so if this cannot be expressed cleanly, say so in the handoff rather than inventing a mechanism — that finding is the point of the example.

## Verification

On the committed tree: `pnpm check` passes (tsc --noEmit, strict: no any, exactOptionalPropertyTypes, noUncheckedIndexedAccess). `pnpm build && pnpm test` passes, including the site-smoke parity test green. The todo-list page renders under the existing demo.js build: on load the list is populated by a real GET of site/fragments/todos.html; adding a row stamps the template with title and id and saves; deleting a row removes it by id and saves; on reload, restore() repopulates the list and every restored row's delete button and input still fire their phrases (a restored delete button that does nothing fails verification). The <pre> snippet shown in the example's code block matches the live demo markup exactly. The handoff records the empty-state finding: how (or whether) the empty list is expressed, and any other gap the example surfaced.

## Prohibited Patterns

- No request mock, fake backend, or simulated failure — the happy path is the subject.
- No duplicating or extending site/examples/offline-fallback.html.
- No shop/cart or search-results example — those come later and reuse this page's findings.
- No silent workarounds and no invented grammar: a capability the DSL lacks is recorded in the handoff, not papered over.
- No /tmp scratch work; any scratch lives in <repo>/scratch/ and is deleted before finishing.
- No code comments unless requested.
