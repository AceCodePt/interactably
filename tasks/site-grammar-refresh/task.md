---
wait_human_start: false
wait_human_merge: false
dependencies: []
---

# Task: Bring every site page up to the current grammar

## Metadata

- **Complexity:** High
- **Priority:** High
- **Status:** Ready for Handoff

## Context

Four mechanism changes landed in quick succession — event-value binding, event-declaration literal matching, the three-way requestable error split, and intersect as one event with named slots — and each migrated only the pages it broke. The result is a site where the four homes (site/docs.html, site/reference.html, README.md, site/index.html) describe the current grammar but the thirty-one pages under site/examples/ teach an uneven mix of old and new shapes, and the newest mechanisms appear nowhere an author would encounter them as things to reach for. This task is a single pass over every page so the examples teach one grammar — the current one.

What the survey found (verified against main at 4664f1a; re-verify before starting, more may have landed):

1. Triple firing in remember-theme.html and remembered-tab.html. Each has three buttons sharing one storable-key with distinct storable-value literals, and every button carries on-load="this.restore()" plus an identical on-restore(value:string) handler. Since restore() no longer matches values, all three fire on load: the attribute is set three times and the toast shows three times. Before binding, two of the three silently no-oped and hid this. The correct shape has one restore site: one element carries on-load="this.restore()" and on-restore(...); the others only save. Note in the handoff that three storable elements remain because save takes no argument and storable-value is static per element — one element per literal — and do NOT change save's signature here; that is a design finding, not a refresh.

2. synced-sections.html carries nineteen storable-key attributes. Audit it for the same pattern; the shape may be fine (several keys) or the same fan-out under one key.

3. Two keyboard grammars coexist (to be resolved by this task). live-preview.html, price-calculator.html and roving-focus.html use the phrase-level key prefix (on-keydown="enter: #mirror.set(this.value); escape: this.clear()", on-keydown="arrowdown: #cb-results-1.focus()"), which matches KeyboardEvent.key case-insensitively via registry/interactable/keys.ts and is dispatched in executor.ts and implementation-utils.ts. docs.html documents this form (lines ~188, 237, 354–379) AND the attribute-literal form on-keydown(code:`Escape`) (lines ~240, 328). Both are live in the runtime. See Decision taken.

4. Literal matching is used by no example. It appears only in docs.html and reference.html. The three-way error split appears in offline-fallback, guarded-submit and order-form, but only on-request-offline and unfiltered response; no page shows on-request-error(status:`…`), and by the static-site rule none should fake one. Keyboard is the natural home for a literal-matching example — Escape closes, Enter submits — and the migration in item 3 provides it.

5. No example uses on-intersect at all. reference.html and docs.html describe it. Decide whether a small reveal-on-scroll page is warranted so the named-slot form has a home; if added it is a widget page in the established shape, not an application.

6. Snippet drift. Every page shows its markup in a <pre> under <details>; site-smoke.test.ts checks four-homes parity and page listing but never that a snippet matches its demo. The combobox page has already drifted. Add a smoke test asserting each example's snippet equals its demo markup modulo the page's id prefix (the prefix rule is already the convention — dl- becomes nothing in dynamic-list), or generate the snippet at build time in scripts/build-site.mjs from the demo markup. Either makes the drift impossible rather than merely caught; prefer whichever is smaller and state why.

7. site/examples.html blurbs and tags: refresh so each entry names the mechanism the page now demonstrates (tags should include the events a page relies on where that is the point, e.g. a page whose subject is on-restore binding).

## Decision taken: retire the phrase-level keyboard prefix

The phrase-level keyboard prefix and the attribute-level literal do the same job two ways. Two grammars for one thing is the pattern the library rejects everywhere else, and the earlier design that all filtering lives in the event declaration was made with this in mind. The human decided to retire the phrase-level prefix. Migrate the three pages to the attribute-literal form (on-keydown(code:`Enter`)="…" on-keydown(code:`Escape`)="…" — two attributes, both fire when they match, which is already the documented rule), remove the prefix grammar from executor.ts, implementation-utils.ts and keys.ts with its tests, and rewrite the docs.html passages that teach it. Costs to weigh: two attributes where there was one; the prefix matched key case-insensitively while the literal matches key or code exactly, so Enter/NumpadEnter and space need choosing deliberately (the docs already state the key-versus-code trade honestly — point at it, do not re-argue it). Keeping both was rejected because no principled split exists for when to use which.

## Requirements

- [ ] Every page under site/examples/ read against the current grammar; a short table in the handoff listing each page and whether it changed, with a one-line reason.
- [ ] remember-theme.html and remembered-tab.html have exactly one restore site each; no triple firing; the design finding about save's signature recorded, not acted on.
- [ ] synced-sections.html audited and fixed if it shares the fan-out; the handoff says which.
- [ ] Keyboard prefix retired: live-preview.html, price-calculator.html and roving-focus.html migrated to on-keydown(code:`…`) attributes; the prefix grammar removed from executor.ts, implementation-utils.ts and keys.ts with its tests and from the parser if it has a parse-time trace (phrase.key); docs.html rewritten so the prefix appears nowhere and the literal form is taught as the way to filter keys; reference.html, README.md and index.html checked for the same.
- [ ] At least one example page demonstrates literal matching as its subject or a clear part of it, with the lede naming it; keyboard is the expected home.
- [ ] on-intersect: decision recorded; if a page is added it follows the established furniture and is registered.
- [ ] Snippet parity made mechanical: a smoke test or build-time generation, applied to every page, with the combobox drift fixed as a consequence.
- [ ] site/examples.html blurbs and tags refreshed to match what each page now teaches.
- [ ] The four homes stay in parity (site-smoke four-homes test green); any docs.html passage that still teaches a retired shape is rewritten.
- [ ] No behaviour, verb, event, config or formula function changes other than removing the keyboard prefix.

## Verification

On the committed tree: pnpm run build then pnpm test and pnpm run check all pass. Loading remember-theme.html and remembered-tab.html sets the attribute once and shows the toast once. Every example page renders under the demo.js build with no console.warn or error. The new snippet-parity check passes for all pages. Grep for `on-keydown="[a-z]*:` across site/ and registry/ returns nothing and the docs.html sidebar and reference cards still light correctly. The handoff carries the per-page table and the decisions taken.

## Prohibited Patterns

- No new grammar and no new verbs; this is a refresh, not a feature.
- No fake backend, mock or simulated failure to give on-request-error(status:`…`) a demo.
- No changing save's signature or storable's config to fix the three-element pattern; record it.
- No touching tasks/example-todo-list or tasks/example-shop-cart pages — they are written against the current grammar and must not need this pass.
- No partial migration of the keyboard grammar: either all three pages and the runtime and the docs move together, or nothing moves.
- No /tmp scratch work; any scratch lives in <repo>/scratch/ and is deleted before finishing.
- No code comments unless requested.
