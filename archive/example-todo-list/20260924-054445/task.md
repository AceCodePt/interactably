---
wait_human_start: false
wait_human_merge: false
dependencies: []
---

# Task: site example — a to-do list, the first application-shaped example

## Metadata

- **Complexity:** Medium
- **Priority:** High
- **Status:** Ready for Handoff

## Context

This revives archive/example-todo-list/task.md, which was archived without shipping: its only two commits are the spec and the archive, and no page exists under site/examples/. It was closed because its dependency, storable-refs-and-restore-filtering, was deleted as obsolete — both halves of that dependency had already landed through other tasks. Every capability this example needs is now on main: renderable takes a raw payload (payload is exclusive with template), storable-value accepts a ref and save() snapshots that element's innerHTML, restore() dispatches a restore event carrying the stored string as a bound field, and event declarations bind values by name (on-restore(value:string)). The original spec is reproduced below with the parts that predated binding rewritten; everything else stands.

All thirty-one examples under site/examples/ are widgets: a character counter, a class toggle, a copy button, roving focus. None is an application, so nothing yet tests whether phrases compose across a whole screen rather than one button at a time. This is the first of several application-shaped examples (a to-do list, a shop/cart, a search results page) whose purpose is as much to find where the DSL cracks under a real page as it is to document it. The cart example (tasks/example-shop-cart) depends on this one and reuses its findings.

The site is published on GitHub Pages, which is static, so there is no server to POST or DELETE to. This example does NOT mock a backend. Faking a failure so the error-filtering path has something to show would be dishonest — there is no reason to demo a failing case for something expected to succeed. site/examples/offline-fallback.html already covers failure, where failure is the subject; here the happy path is the subject. So the seam is drawn honestly: the initial list is a real GET of a static fragment, exactly as network-quote.html already does end to end on this static site, and every mutation after that is local. The lede must say so plainly, the way network-quote's lede names its own constraint.

Shape:
- site/fragments/todos.html holding a few seeded <li> rows in the same markup shape the template produces. Each row carries its own delete phrase, the way fragments/quote.html carries its own reload button — the trigger arrives with the response, no extra wiring, which is worth calling out in the prose.
- A GET via requestable on load, rendered with on-response(html:string)="#todo-list.render({payload: html})", exactly as network-quote does.
- Adding a row: on-click="#todo-list.render({template: #todo-row-tpl, swap: 'beforeend', title: #todo-input.value, id: now()})". The id comes from now(), which exists for exactly this. dynamic-list.html already does this shape without a title slot; follow it.
- Deleting a row: the template authors <li id="todo-row-{id}"> and a button carrying on-click="#todo-list.render({swap: 'delete', target: '#todo-row-{id}'})". The clone is stamped before attachment so the parser reads an ordinary ref. No walk-up, no row keyword. dynamic-list.html already does this.
- Persistence, one save site: the list element implements renderable and carries on-rendered="#todo-store.save()", so every mutation — add, delete, undo is NOT covered by rendered, see findings — snapshots the list. #todo-store is a storable with storable-value="#todo-list", so save() writes the list's innerHTML. This is the DOM-is-the-source-of-truth shape: storage mirrors the DOM, nothing is concatenated, no array exists.
- Restore: #todo-store carries on-load="this.restore()" and on-restore(value:string)="#todo-list.render({payload: value})". The stored markup flows into the phrase as a bound name. Restore is unfiltered because the stored value is unbounded — there is nothing to match against, and the binding form is the correct one.
- Ordering on load: both the GET and the restore fire on load. Decide and document which wins. The honest shape is: restore first (synchronous, from storage), and the GET only when nothing was restored — but the grammar has no "only if nothing stored" branch. If the two collide, the page must not silently pick one by timing. Record the collision as a finding; a defensible resolution is to make the initial GET a button ("Load the sample list") rather than on-load, so the seed is an explicit action and restore owns load. That also makes reload honest: what the user added is still there.

Notes for the implementer: this example exists to surface gaps. If a step needs a capability the DSL does not have, do not work around it silently and do not invent grammar: record it plainly in the handoff. A list of "here is where a real page hit a wall" is a more valuable output than a polished page that hides the walls. Known likely gaps to confirm or refute:
- Empty state — what the list shows before anything is added and after the last row is deleted. The library has no conditional rendering.
- undo() does not fire rendered, so an undo after a save leaves storage ahead of the DOM until the next render. Either wire the undo button to also call #todo-store.save(), or record that undo and rendered are not aligned.
- Clearing the input after add: #todo-input.value is read into the slot, but nothing empties the input. Check whether an existing verb does this (modifiable's reset/clear) and use it; if none fits, record it.
- A restored row's delete button must work. start.ts runs a document-level MutationObserver, so injected markup attaches, but this is the first page to depend on restored markup carrying live phrases. A restored delete button that does nothing is the failure mode to watch for.

## Requirements

- [ ] site/fragments/todos.html with seeded rows matching the template's markup exactly. Any drift between fragment and template shows up as rows that look alike but behave differently.
- [ ] site/examples/todo-list.html following the established page furniture: topnav, examples-back link, doc-title, doc-lede, demo, and the <details> code block with the copy button. Ids on the page are prefixed (todo-) as other pages prefix theirs, so the shown snippet may use the short ids.
- [ ] The lede states the constraint honestly — the seed is a real request, mutations are local because the site is static, persistence is local storage. Do not imply a backend.
- [ ] Adding, deleting and restoring rows work as shaped above; restore uses on-restore(value:string) and render({payload: value}); persistence has exactly one save site (on-rendered on the list) plus whatever undo needs.
- [ ] Registered in site/examples.html alongside the others, with blurb and tags in the established shape.
- [ ] The shown code block must match the live demo markup up to the id prefix. site-smoke.test.ts covers implementation-table parity but NOT example snippets, and the combobox example has already drifted this way — prefer generating the snippet from the demo markup over copying it.
- [ ] Restored rows are live: after reload, every restored row's delete button fires its phrase.
- [ ] The handoff records every gap the page surfaced, at minimum: empty state, undo/rendered alignment, clearing the input after add, and the on-load ordering between GET and restore — each with how it was handled or why it could not be.

## Verification

On the committed tree: pnpm run build then pnpm test and pnpm run check all pass, including the site-smoke test that every example page is listed and standalone. The todo-list page renders under the existing demo.js build: the seed GETs site/fragments/todos.html and renders it; adding a row stamps the template with title and id; deleting a row removes it by id; every render snapshots the list into storage; on reload, restore() hands the stored markup to render({payload}) and the list reappears with every delete button working. The <pre> snippet matches the live demo markup. The handoff lists the findings above.

## Prohibited Patterns

- No request mock, fake backend, or simulated failure — the happy path is the subject.
- No duplicating or extending site/examples/offline-fallback.html or dynamic-list.html; link to them in prose where the same shape is reused.
- No shop/cart or search-results example — the cart is tasks/example-shop-cart and reuses this page's findings.
- No changes to renderable, storable or requestable; if one seems needed, that is a finding for the handoff, not a change.
- No silent workarounds and no invented grammar: a capability the DSL lacks is recorded in the handoff, not papered over.
- No phrase-level key prefix (on-keydown="enter: …") on this page; if Enter-to-add is wanted, use on-keydown(code:`Enter`) — see tasks/site-grammar-refresh.
- No /tmp scratch work; any scratch lives in <repo>/scratch/ and is deleted before finishing.
- No code comments unless requested.
