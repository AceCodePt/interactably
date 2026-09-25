---
wait_human_start: false
wait_human_merge: false
dependencies: []
---

# Task: Rename the bootstrap script attribute to implementations

## Metadata

- **Complexity:** Medium
- **Priority:** High
- **Status:** Ready for Handoff

## Context

WHY. On the bootstrap script tag only, the attribute `implements` is renamed to `implementations`. Elements keep `implements` unchanged. One word doing two jobs forced a chain of awkward constraints — scoping every query by tag, the head-versus-body placement rule, a prohibition on bare `[implements]` selectors. Two words dissolve all of it: an element implements a behaviour (a verb about that element); the script tag is not implementing anything, it is listing which implementations to load (a noun).

MECHANICAL SCOPE. src/bootstrap.ts (`declaredNames`), tests/bootstrap.test.ts, tests/site-smoke.test.ts, all 35 example pages, site/index.html, site/docs.html, site/examples.html, site/reference.html, README.md — and packages/language-server (see below; the repo-wide verification greps require it). In the docs and README the prose that distinguished declaration from usage by explaining that one attribute means two things now names two different attributes; those sentences get simpler, not just renamed. Embedded code snippets in `<pre><code>` blocks must change too: they decode to `<script type="module" implementations="...">`.

THREE FOLD-INS.
1. Widen the query. `declaredNames` currently queries `document.head` specifically, which was right only while a body-placed tag would have been attached as a participant. With a distinct attribute that danger is gone, so widen to the whole document: `document.querySelectorAll("script[implementations]")`. A tag at the end of the body is a normal thing to write and is currently ignored in complete silence.
2. The unknown-name error is the real bug. It is thrown inside a promise whose only handler is `bootstrap().catch((error) => console.error(error))`. The brief said loud; a console message from a caught rejection is the quietest kind of loud. The failure must be genuinely surfaced and observable, not swallowed. `start()` must still run before the failure is raised so recognised implementations attach. Decide and report the mechanism. Constraint to respect: a truly uncaught promise rejection crashes `node --test`, so the auto-run path and the exported `bootstrap()` may need separating so tests can assert the rejection without killing the runner (e.g. assert on the exported function directly, and/or observe the auto-run through an `unhandledRejection`/error-event listener).
3. Keep the body-scoped scan in `start()` even though the rename removes its original justification. Scanning the head for participants was always wasted work, and it means a future head element carrying an `on-*` can never accidentally go live.

DO NOT TOUCH the per-name dynamic imports in bootstrap.ts. The brief recommended a static map and the implementer chose dynamic imports; that was the better call, and a rename task must not quietly revisit it.

LANGUAGE SERVER (added by this task's author; it was not in the original mechanical list but the repo-wide greps fail without it). packages/language-server carries the overloaded-implements logic: `isBootstrapTag` returns true for a script with `implements` OR a module script with a recognised CDN `src` (analysis.ts:42-49); `implementationNamesOf`, `declarations`, diagnostics (missing-bootstrap, unknown-implementation, undeclared-implementation) and completion all distinguish script from element by tag; and there are url-* fixtures and tests for the src-shape recognition. With a distinct attribute the overload disappears: a declaration is `script[implementations]`, a usage is `implements` on a non-script element. `isBootstrapTag` becomes simply "a script carrying `implementations`", and the URL-shape recognition (`isRecognisedBootstrapSrc`, the CDN_PREFIXES list, and the url-* fixtures/tests) becomes a dead workaround for the old overload and should be removed. A declaration with an unrecognised or absent src is still the bootstrap — the attribute carries the decision, as intended. If the implementer believes the URL recognition should survive, they report why.

CURRENT STATE (for reference). The merged implementation at commit 190dd66 already has: src/bootstrap.ts with a static map of `import()` thunks and `document.head.querySelectorAll("script[implements]")`; registry/interactable/start.ts with `documentRoot = root.nodeType === 9` and a body-scoped `collectFromRoot`/`observeTarget`; dist/cdn/interactably-bootstrap.js as the emitted artifact; site pages with a head `<script type="module" implements="..." src="../cdn/interactably-bootstrap.js">`; site/docs.html:156 and README.md:48 rows describing the bootstrap as reading the head `script[implements]`. The html-language-server and declarative-bootstrap tasks are both archived.

## Requirements

- [ ] The script-tag attribute is renamed to `implementations` in src/bootstrap.ts; element `implements` is unchanged. `declaredNames` queries `document.querySelectorAll("script[implementations]")` across the whole document (not `document.head`), splits on whitespace, drops empties, dedupes, and unions across all matching tags.
- [ ] A `script[implementations]` anywhere (head or body) is never a participant: `isParticipant` still keys off `implements` and `on-*` only. `start()` keeps the body-scoped scan and observation for a Document root, including the explicit body participation test; an Element root is unchanged.
- [ ] The unknown-name failure names the unknown name(s) and lists the available implementations, and `start()` runs first so the recognised implementations still attach. The failure is genuinely surfaced and observable, not swallowed by a `.catch` that only calls `console.error`. The implementer chooses and reports the mechanism, respecting that an uncaught rejection crashes `node --test`.
- [ ] `bootstrap()` stays exported, and the per-name dynamic `import()` thunks in src/bootstrap.ts are unchanged.
- [ ] packages/language-server: a declaration is a script carrying `implementations`; a usage is `implements` on a non-script element. `isBootstrapTag` is reduced to "a script carrying `implementations`", and the URL-shape recognition (`isRecognisedBootstrapSrc`, the CDN prefix list) and its url-* fixtures/tests are removed as a dead workaround for the old overload. analysis.ts, diagnostics.ts and completion.ts are updated for the split, including the missing-bootstrap message (`<script type="module" implementations="...">`), the unknown-implementation span (read from `implementations` on scripts) and the undeclared-implementation message. All language-server fixtures and tests are updated.
- [ ] All 35 pages in site/examples/ rename the script tag attribute to `implementations`; element-level `implements` is untouched. site/index.html, site/docs.html, site/examples.html and site/reference.html are updated, including embedded `<pre><code>` snippets that render `<script type="module" implementations="...">`.
- [ ] README.md is updated, including the bundle-table row that currently says the bootstrap "reads the head `script[implements]`", and the embedded snippet at lines 8 and 30.
- [ ] Docs and README prose that explained one attribute meaning two things is rewritten to name the two attributes — simpler sentences, not a find-and-replace. The participation-rule clause about the head is reviewed: the rename removes the declaration/usage reason, but the body-scoped scan stands, so an element in the head carrying `on-*` still never participates.
- [ ] tests/bootstrap.test.ts is updated: head markup uses `implementations`; the placement expectation widens so a `script[implementations]` at the end of the body is read; the unknown-name test asserts the chosen error mechanism; the empty-attribute, seventeen-name, and two-tag-union tests are retained.
- [ ] tests/site-smoke.test.ts is updated: each page's declaration is read from `script[implementations]` anywhere in the document, and the per-page exact-one assertion is adjusted to match the widened location rule.
- [ ] The build and test suite pass on the committed tree: `pnpm build && pnpm test` and `pnpm check`, with the language-server package tests included.

## Verification

- `pnpm build && pnpm test` and `pnpm check` pass on the committed tree, including packages/language-server tests.
- grep for `script[implements]` across source (excluding archive/ task specs, dist/ and node_modules) returns nothing.
- grep for `script type="module" implements` across source (excluding archive/, dist/ and node_modules) returns nothing, including inside `<pre><code>` snippets and language-server fixtures.
- A page whose script tag says `implementations="revealable"` attaches a revealable element; a tag placed at the end of the body is read; a page naming a nonexistent implementation raises an observable error and still attaches everything else; the script tag itself is never attached.
- The language server reports missing-bootstrap and undeclared-implementation correctly with `script[implementations]`, and no longer matches a bootstrap script by its src shape alone.
- The handoff reports the error-surfacing mechanism chosen and why, and whether any URL-shape recognition in the language server was kept or removed.

## Prohibited Patterns

- Do NOT rename element-level `implements`; only the script tag's attribute changes to `implementations`.
- Do NOT touch the per-name dynamic imports in bootstrap.ts.
- Do NOT keep or re-add URL-shape bootstrap recognition in the language server as a workaround; the attribute carries the decision.
- Do NOT leave the unknown-name failure swallowed by a catch that only calls console.error.
- Do NOT remove the body-scoped scan in start(), and do NOT add a tag check or exclusion list to isParticipant.
- Do NOT change the signature of start() or of any existing named export, and do NOT auto-start on import of the package main.
- Do NOT query `document.head` specifically in declaredNames; scope to the whole document but still to `script[implementations]`, never a bare `[implementations]`.
- Do NOT fail silently on an unknown name.
- Do NOT touch the parser, executor, phrase grammar or any implementation's verbs or events. This task changes the script-tag attribute name and the queries around it.
