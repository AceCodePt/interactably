---
wait_human_start: false
wait_human_merge: false
dependencies: []
---

# Task: bring every site page up to the current grammar

## Metadata

- **Complexity:** High
- **Priority:** High
- **Status:** Ready for Handoff

## Context

Four mechanism changes landed in quick succession — event-value binding, event-declaration literal matching, the three-way requestable error split, and intersect as one event with named slots — and each migrated only the pages it broke. The result is a site where the four homes (site/docs.html, site/reference.html, README.md, site/index.html) describe the current grammar but the thirty-one pages under site/examples/ teach an uneven mix of old and new shapes, and the newest mechanisms appear nowhere an author would encounter them as things to reach for. This task is a single pass over every page so the examples teach one grammar — the current one.

What the survey found (re-verified against main at 4664f1a before writing this; several counts below were corrected by that pass):

1. Triple firing in remember-theme.html and remembered-tab.html. Each has three buttons sharing one storable-key with distinct storable-value literals, and every button carries on-load="this.restore()" plus an identical on-restore(value:string) handler. Since restore() no longer matches values, all three fire on load: the attribute is set three times and the toast shows three times. Before binding, two of the three silently no-oped and hid this. The correct shape has one restore site: one element carries on-load="this.restore()" and on-restore(...); the others only save. Note in the handoff that three storable elements remain because save takes no argument and storable-value is static per element — one element per literal — and do NOT change save's signature here; that is a design finding, not a refresh.

2. synced-sections.html carries the same fan-out, not a benign multi-key shape: nine demo buttons all use storable-key="pm" across three tab bars, and every one carries on-load="this.restore()" plus its own on-restore. It fires the same way and is fixed the same way: one restore site per distinct storable-value, the other two buttons per bar save only. The handoff says so explicitly.

3. Two keyboard grammars coexist (to be resolved by this task). The phrase-level key prefix (`on-keydown="enter: …"`) is used by more than the three pages first listed: live-preview.html, price-calculator.html, roving-focus.html, suggest-as-you-type.html, and site/fragments/cities.html (the fragment suggest-as-you-type fetches), plus the hero demo in site/index.html and many passages in docs.html, reference.html and README.md. It matches KeyboardEvent.key case-insensitively via registry/interactable/keys.ts and is dispatched in executor.ts and implementation-utils.ts. docs.html documents this form (lines ~188, 237, 354–379) AND the attribute-literal form on-keydown(code:`Escape`) (lines ~240, 328). Both are live in the runtime. See Decision taken.

4. Literal matching is used by no example. It appears only in docs.html and reference.html. The three-way error split appears in offline-fallback, guarded-submit and order-form, but only on-request-offline and unfiltered on-request-error/#alert.show(); no page shows on-request-error(status:`…`), and by the static-site rule none should fake one. Keyboard is the natural home for a literal-matching example — Escape closes, Enter submits — and the migration in item 3 provides it.

5. No example uses on-intersect at all. reference.html and docs.html describe it, and the docs sidebar is the only consumer anywhere. A dedicated example page for it is being briefed separately, so this task records the decision and does not add one; two agents must not write the same page.

6. Snippet drift. Every page shows its markup in a <pre> under <details>; site-smoke.test.ts checks four-homes parity and page listing but never that a snippet matches its demo. The roving-focus page has already drifted. The snippets are teaching material and legitimately elide wrapper divs, classes, `type="button"` and demo-note markup, so a strict "snippet equals demo modulo the id prefix" is false across most pages and build-time generation would either dump all of that into the snippet or need an annotation system to hold it back. The mechanism is therefore the narrow drift test below.

## Decision taken: retire the phrase-level keyboard prefix

The phrase-level keyboard prefix and the attribute-level literal do the same job two ways. Two grammars for one thing is the pattern the library rejects everywhere else, and the earlier design that all filtering lives in the event declaration was made with this in mind. The human decided to retire the phrase-level prefix. Migrate the five example pages and the fragment and index.html to the attribute-literal form (on-keydown(code:`Enter`)="…" on-keydown(code:`Escape`)="…" — two attributes, both fire when they match, which is already the documented rule), remove the prefix grammar from the keyboard path in executor.ts, from implementation-utils.ts and keys.ts with its tests, and rewrite the docs.html passages that teach it. Costs to weigh: two attributes where there was one; the prefix matched key case-insensitively while the literal matches key or code exactly, so Enter/NumpadEnter and space need choosing deliberately (the docs already state the key-versus-code trade honestly — point at it, do not re-argue it). Keeping both was rejected because no principled split exists for when to use which.

What "the prefix grammar" is, precisely: only the keyboard interpretation. `phrase.key` in the parser is also the routing key for implementation events (`timeout: #alert.show()` matching an ImplementationEvent whose key is `"timeout"`), and that stays. The parser's KEY slot, the parser tests for it, and the ImplementationEvent branch in the executor's key guard all remain. What goes is the KEYBOARD_EVENT_TYPES branch in executor.ts, registry/interactable/keys.ts, and the `matchesKey` filtering inside bindEvents.

The hidden dependency is prevent-default. `derivedDefaults` reads `phrase.key` to claim `keydown:<key>`, so it cancels only the key the phrase handles rather than every keystroke; that precision is the point. After the prefix dies, derive the claim from a literal on the event declaration instead: a `key:` or `code:` literal named on the on-keydown attribute contributes its literal, and because the literal names which field it matches, the derived claim must preserve that field so the matcher checks the right event property (the config syntax `keydown:Enter` keeps matching KeyboardEvent.key as today; a derived `code:` claim must not be compared against `key`). Where the declaration binds types rather than matching, or there is no declaration, nothing is derived and the existing "no events derived" console.warn fires, which already names prevent-default-events as the manual hatch. The `events` config value syntax `click, keydown:Enter` must keep working: it lives in a config value, not an attribute name, so it is unaffected by the prefix removal.

## Requirements

- [ ] Every page under site/examples/ read against the current grammar; a short table in the handoff listing each page and whether it changed, with a one-line reason.
- [ ] remember-theme.html and remembered-tab.html have exactly one restore site each; no triple firing; the design finding about save's signature recorded, not acted on.
- [ ] synced-sections.html fixed for the same fan-out (nine same-key buttons, three restore sites collapse to one per bar); the handoff says so.
- [ ] Keyboard prefix retired as one indivisible change: live-preview.html, price-calculator.html, roving-focus.html, suggest-as-you-type.html, site/fragments/cities.html and site/index.html migrated to on-keydown(code:`…`)/on-keydown(key:`…`) attributes; the prefix grammar removed from the keyboard path in executor.ts, from implementation-utils.ts and keys.ts with their tests; the parser and the ImplementationEvent routing key untouched; docs.html rewritten so the prefix appears nowhere and the literal form is taught as the way to filter keys; reference.html, README.md and index.html checked for the same.
- [ ] prevent-default derivation moved from phrase.key to declaration literals, preserving the key-versus-code field, with the fall-through to the existing warn when nothing is derivable; its tests, the no-propagate `events` config test, the implementation-utils bindEvents test and the site-smoke prevent-default assertion updated. The `event:key` config escape hatch still works.
- [ ] At least one example page demonstrates literal matching as its subject or a clear part of it, with the lede naming it; keyboard is the expected home.
- [ ] on-intersect: decision recorded (docs-only; page briefed separately); no page added here.
- [ ] Snippet drift made mechanical as a narrow test: every attributed element in a demo appears in that page's snippet, prefix-normalised, and no attributed element in the snippet is absent from the demo (the second direction catches the roving-focus drift). Applies to every page; the roving-focus drift is fixed.
- [ ] site/examples.html blurbs and tags refreshed to match what each page now teaches.
- [ ] The four homes stay in parity (site-smoke four-homes test green); any docs.html passage that still teaches a retired shape is rewritten.
- [ ] No behaviour, verb, event, config or formula function changes other than removing the keyboard prefix and moving prevent-default's derivation.

## Verification

On the committed tree: `pnpm run build` then `pnpm test` and `pnpm run check` all pass. Loading remember-theme.html and remembered-tab.html sets the attribute once and shows the toast once. Every example page renders under the demo.js build with no console.warn or error. The new snippet-drift check passes for all pages. Grep for `on-keydown="[a-z]*:` across site/ and registry/ returns nothing and the docs.html sidebar and reference cards still light correctly. `pnpm test` exercises prevent-default canceling exactly the derived key and leaving others alone. The handoff carries the per-page table and the decisions taken.

## Prohibited Patterns

- No new grammar and no new verbs; this is a refresh, not a feature.
- No fake backend, mock or simulated failure to give on-request-error(status:`…`) a demo.
- No changing save's signature or storable's config to fix the three-element pattern; record it.
- No touching tasks/example-todo-list or tasks/example-shop-cart pages — they are written against the current grammar and must not need this pass.
- No partial migration of the keyboard grammar: the five pages, the fragment, index.html, the runtime and the docs move together, or nothing moves.
- No removing `phrase.key` or the parser KEY slot — the ImplementationEvent routing key depends on them.
- No dropping prevent-default's key precision; deriving `keydown` unconditionally is a regression.
- No /tmp scratch work; any scratch lives in <repo>/scratch/ and is deleted before finishing.
- No code comments unless requested.
