---
wait_human_start: false
wait_human_merge: false
dependencies: []
---

# Task: Declarative bootstrap — the script tag becomes the registry

## Metadata

- **Complexity:** High
- **Priority:** High
- **Status:** Ready for Handoff

## Context

Today a page bootstraps Interactably by hand. site/demo.src.js is the canonical shape: seventeen bare side-effect imports, then `import { start }`, then `start()`. README.md and site/index.html teach the same thing with the CDN bundle. The list of implementations in use is stated in JavaScript, in a file the author writes, while the markup that uses them lives elsewhere. Three problems: (1) spaghetti for what it achieves; (2) the declaration and the usage can drift silently — markup says implements="revealable", the module forgot the import, nothing tells you; (3) not statically readable — a module can contain anything and resolve any specifier, so tooling has no general answer.

This task inverts it. The script tag declares what the page uses, in an `implements` attribute, as literal text. The module that reads that attribute and does the importing ships in the package, not written by the author. The attribute is the same `implements` an element carries: one word, one vocabulary. The script tag is a declaration, never a participant. This is not a duplicate of the module's import list — it replaces it. There is exactly one list, in the document, and it is load-bearing.

The immediate beneficiary is the HTML language server (tasks/html-language-server, depends on this one), which can read a page's vocabulary from the document it is already parsing. The change stands alone regardless: it removes a handwritten file from every project and an entire class of silent failure.

PLACEMENT AND SCOPING (the one runtime semantic change). `start(root = document)` at registry/interactable/start.ts:7 scans `root.querySelectorAll("*")` and observes `root` with `subtree: true`. `isParticipant` (start.ts:107) returns true for anything carrying `implements` or an `on-*` attribute, with no tag check. So a declaring script in the head would be a participant and get attached. Fix it by scoping, not exclusion: when the root is a Document, `start()` scans and observes `document.body` — the body element itself plus everything it contains — and never visits the head. `isParticipant` stays exactly as it is. An Element root behaves as before. Two consequences to confirm: (a) `querySelectorAll` does not return its own root, so `body` must be tested for participation explicitly — `<body implements="logger">` is legitimate and must still attach; (b) `document.body` is null while the document is still parsing. Module scripts are deferred so the shipped bootstrap never hits this; a hand-written `start()` in a classic inline head script could. The existing `readyState === "loading"` path already defers the initial scan to DOMContentLoaded, and body resolution plus the `observer.observe` call must be deferred the same way rather than throwing. Note start.ts:90 calls `observer.observe(root, ...)` unconditionally and synchronously, before the `documentReady` branch; scoping to body therefore requires moving the observe call behind a body-present check and calling observe inside the DCL callback on the loading path, with `collectFromRoot` becoming "body plus document.body.querySelectorAll('*')" and testing body itself.

HEAD PLACEMENT IS EXPLICIT. The migration removes every end-of-body `<script type="module" src="../demo.js">` and adds a `<script type="module" implements="…">` to the head. Module scripts are deferred, so nothing is lost. The bootstrap reads `document.head.querySelectorAll("script[implements]")` — never a bare `[implements]` — so the two halves are symmetric: the runtime searches the body, the bootstrap searches the head, and neither can see the other's half. A tag mistakenly placed in the body declares nothing (the head-scoped bootstrap ignores it) AND gets attached (the body-scoped runtime sees it); a test asserts the latter and the language server gets a matching diagnostic (separate task).

RESOLUTION STRATEGY — settled here, do not reopen. Registration is a side effect of module evaluation: `defineImplementation` calls `registerImplementation` at module top level (_implementation-definition.ts:30-38). A bundle containing all seventeen would therefore register all seventeen unconditionally, making the attribute non-load-bearing and falsifying the empty-attribute requirement. Resolution must be a static map of per-implementation lazy `import()` thunks in the bootstrap module, e.g. `const impls: Record<string, () => Promise<unknown>> = { revealable: () => import(".../revealable.js"), ... }`. Every specifier is literal (bundlers can still see each chunk) while only the declared names evaluate and register; the implementation files are the already-shipped CDN files. Do NOT statically import the seventeen behavior modules into the bootstrap.

ARTIFACT. A distinct bootstrap entry emitted by the CDN build: core plus the name→thunk map, not the package main and not `+esm`. Importing the package main must stay side-effect-free because `start()` remains exported and directly usable; auto-starting on import would break that. The documented tag points at that file's path under the package. The site must load the same artifact the CDN ships, not a parallel site-only build.

SETTLED DECISIONS: the attribute is the single source of truth; the runtime searches the body, the bootstrap searches the head; the bootstrap ships with the package; built-in implementations only (names resolve against what src/index.ts exports, nothing else); the attribute takes the declared name — the first argument of each `defineImplementation` call — not the export identifier. The canonical seventeen, as the attribute must spell them: attributable, auto-grow, classable, copyable, dirtyable, focusable, formattable, logger, modifiable, no-propagate, pastable, prevent-default, renderable, requestable, revealable, storable, validatable. The exports `noPropagate` and `preventDefault` are reached by their kebab-case names. An unknown name is a loud runtime error naming it and listing what is available. `start()` remains exported and usable directly — programmatic callers, tests and test-harness.ts keep working unchanged.

COORDINATION. archive/declarative-bootstrap/task.md is a prior incarnation that was archived unimplemented (commit 231c06a is a rename with no code). tasks/html-language-server/task.md declares `dependencies: [declarative-bootstrap]` and its context states "Declarative bootstrap (landed)" — that is false; correct that context as part of this work, or report it in the handoff. The language-server follow-ons (a diagnostic for a body-placed declaration; loosening its URL-shape matching to "the package name appears in a module script's src") belong to the language-server task, not this one.

## Requirements

- [ ] A bootstrap entry point ships in the package and is the documented way to start Interactably. It reads an `implements` attribute off `script[implements]` tags in `document.head`, resolves each space-separated name against the built-in implementations via a static map of lazy `import()` thunks, evaluates only the declared names, and calls `start()` once. Lookup is scoped to `document.head.querySelectorAll("script[implements]")`, never a bare `[implements]`.
- [ ] An empty or absent attribute evaluates no implementation modules and still calls `start()`, so a page using only `on-*` triggers with no implementations works. This test pins the lazy resolution strategy.
- [ ] An unrecognised name throws a clear error naming it and listing the available implementations. It does not fail silently and does not prevent the recognised ones from attaching.
- [ ] Two tags in the head declaring implementations union their lists; `start()` still runs once (verify `start()` remains idempotent per root via its `disposers` WeakMap).
- [ ] With a `Document` root, `start()` scans and observes `document.body` (including the body element itself) instead of the whole document. `isParticipant` is unchanged. An `Element` root behaves as before. Covered by tests: a declaring `script[implements]` in the head has no attachment; a `script[implements]` placed in the body IS attached; an element added to the head after load with `implements` is never attached; an element added to the body after load is; `<body implements="...">` attaches.
- [ ] `start()` and every named export in `src/index.ts` keep their current signatures. Nothing existing is removed from the public surface.
- [ ] The CDN build (rolldown.config.mjs, dist/cdn/) emits the bootstrap entry alongside the current core bundle; it contains core plus the name→thunk map whose thunks reference the per-implementation CDN files. The fifth rolldown config (site/demo.src.js → dist/site/demo.js) is removed or repointed so the site loads the same artifact the CDN ships, not a parallel site-only build.
- [ ] scripts/build-site.mjs drops its demo.js handling (lines 11, 140, 151) and copies the bootstrap artifact instead.
- [ ] site/demo.src.js is deleted and the generated dist/site/demo.js is gone. The seventeen-imports-plus-`start()` shape does not survive as the site's bootstrap.
- [ ] tests/site-smoke.test.ts is rewritten rather than patched: read each page's head `script[implements]`, register only those names, mount the page's body markup, start. KNOWN_BUNDLES and the `src="../demo.js"` assertion go; an assertion that every page has exactly one `head > script[implements]` replaces it. This makes the smoke test a per-page check that the declared list is sufficient, enforcing the no-blanket-list requirement.
- [ ] All 35 pages in site/examples/ are migrated: remove the end-of-body `<script type="module" src="../demo.js">`, add a head `<script type="module" implements="…">` naming the implementations that page actually uses (derived from the page's element-level `implements`), never a blanket seventeen. Prose in site/examples/one-panel.html:35-38,63 and site/examples.html:50 that teaches calling `start()` is rewritten.
- [ ] site/index.html is migrated: the Quick start snippet (~lines 56-63, placed in the head and pointing at the bootstrap artifact) and the prose at ~lines 36, 67 and 150, which currently teach `start()` as the thing an author calls.
- [ ] site/docs.html is migrated: seven occurrences of `start()` (lines 100, 114, 127, 167, 482, 1184, 1326). Those describing `start()` as the attachment mechanism (the participation rule, the observer) stay accurate and may keep the name; those teaching it as the thing an author calls are rewritten. The participation rule at lines 165-173 gains an explicit clause: the runtime looks at the body and what it contains; nothing in the head is ever a participant. The note at lines 127-130 about a synchronous head script is reviewed and made coherent with the new head-module default.
- [ ] site/reference.html and site/fragments/ are checked and migrated if they teach the old pattern.
- [ ] README.md is migrated: the hook at line 5, the snippet at lines 8-12, the Quick start section at lines 24-49 which teaches importing the core bundle and calling `start()`, and the participation rule at line 58 which gains the body/head clause. The architecture note at line 163 is checked and kept if still true.
- [ ] AGENTS.md is updated if it documents the bootstrap pattern.
- [ ] Tests cover: resolution of each of the seventeen built-ins by its declared name (including no-propagate and prevent-default); the unknown-name error; the empty-attribute case; the two-tag union; a head `script[implements]` producing no attachment; a body `script[implements]` being attached; `<body implements="...">` attaching; an element added to the head after load never attaching; an element added to the body after load attaching.
- [ ] tasks/html-language-server/task.md has its context corrected (the "Declarative bootstrap (landed)" claim is false) if it is still present; otherwise the handoff reports it.

## Verification

- pnpm run build then pnpm test pass with no new failures.
- pnpm run build:site succeeds and every example page still behaves — spot-check at least one page per implementation.
- grep -rn "start()" site/ README.md returns only occurrences that describe mechanism, none that instruct an author to call it.
- grep -rn "demo.js" site/ returns nothing.
- A page whose head tag says implements="revealable" attaches a revealable element; a page naming a nonexistent implementation logs a clear error and still attaches everything else; the script tag itself is never attached. A script[implements] placed in the body is attached, demonstrating why it belongs in the head.
- Handoff reports the resolution strategy chosen and why, the bootstrap artifact filename, and the per-page implementation lists derived for the examples.

## Prohibited Patterns

- Do NOT keep site/demo.src.js's import-list-plus-start() shape anywhere, including in docs as an alternative. It is the pattern being retired.
- Do NOT remove or change the signature of start(), or of any existing named export.
- Do NOT statically import the seventeen behavior modules into the bootstrap in a way that registers them unconditionally; resolution must be lazy per declared name.
- Do NOT make the bootstrap resolve, fetch or analyse anything outside the package. No user implementations, no specifier resolution, no config file.
- Do NOT give a single example page a blanket list of all seventeen implementations. Each page declares what it uses.
- Do NOT fail silently on an unknown name.
- Do NOT query a bare [implements] selector when locating the bootstrap tag. Scope it to document.head.querySelectorAll("script[implements]").
- Do NOT add a tag check or an exclusion list to isParticipant. Head content is kept out by scoping the scan to document.body, not by filtering.
- Do NOT drop the body element itself from the scan. querySelectorAll omits its root; test body explicitly.
- Do NOT throw when document.body is null at call time; defer to DOMContentLoaded as the loading path already does.
- Do NOT introduce a build step for consumers. The declarative tag must work on a static page loaded from a CDN with no tooling.
- Do NOT auto-start on import of the package main; start() stays explicit and directly usable.
- Do NOT touch the parser, executor, phrase grammar or any implementation's verbs or events. This task changes only how implementations get registered.
