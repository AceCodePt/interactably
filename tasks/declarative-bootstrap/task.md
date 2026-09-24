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

Today a page bootstraps Interactably by hand. site/demo.src.js is the canonical shape: seventeen bare import statements for side effects, then import { start }, then start(). README.md and site/index.html teach the same thing with the CDN bundle. The list of implementations in use is therefore stated in JavaScript, in a file the author writes, while the markup that uses them lives somewhere else entirely.

That is wrong in three ways: (1) it is spaghetti for what it achieves — every page's bootstrap module is the same four lines with a different import list; (2) the declaration and the usage can drift — markup says implements="revealable", the module forgot to import it, and nothing tells you except the behaviour silently not happening; (3) it is not statically readable — a module can contain anything, and tooling wanting to know which implementations a page uses would have to analyse arbitrary JavaScript and resolve arbitrary specifiers.

This task inverts it. The script tag declares what the page uses, in an implements attribute, as literal text. The module that reads that attribute and does the importing is shipped by the package, not written by the author. The attribute is deliberately the same implements an element carries — one word, one vocabulary. The script tag is a declaration rather than a usage: it is never a participant, never attached, nothing instantiated against it.

This is not duplication of the module's import list — it replaces it. There is exactly one list, in the document, and it is load-bearing.

The immediate beneficiary is the HTML language server (separate brief, depends on this one), which can read a page's vocabulary out of the document it is already parsing. But the change is worth making regardless: it removes a handwritten file from every project and removes an entire class of silent failure.

SHAPE: the author writes one tag:
  <script type="module" src="https://cdn.jsdelivr.net/npm/interactably@1/+esm" implements="revealable requestable classable"></script>
The bootstrap module reads that tag, resolves each named implementation, and calls start().

WHERE THE RUNTIME LOOKS: start(root = document) at registry/interactable/start.ts:7 scans root.querySelectorAll("*") and observes root with subtree:true. isParticipant (start.ts:107) returns true for anything carrying implements or an on-* attribute, with no tag check. So with the default root, the bootstrap <script> in the head is a participant and start() would attach it and instantiate every named implementation against it. Do NOT fix this with an exclusion. Fix it by scoping the search: when the root is a Document, the runtime scans and observes document.body — the body element itself plus everything it contains — and never visits the head. Head content is out of the search space, so there is no exclusion to write and isParticipant stays exactly as it is. Passing an Element as root already scopes the search to that element and is unchanged.

Two consequences to confirm: (a) querySelectorAll does not return its own root, so body must be tested for participation explicitly — <body implements="logger"> is legitimate and must still attach; (b) document.body is null while the document is still being parsed. Module scripts are deferred so the shipped bootstrap never hits this; a hand-written start() in a classic inline head script could. The existing readyState === "loading" path already defers the initial scan to DOMContentLoaded; body resolution and the observe call must be deferred the same way rather than throwing. This is the one semantic change to the runtime in this task. The participation rule as documented gains a clause: the runtime looks at the body and what it contains; nothing in the head is ever a participant.

Note: start.ts line 90 calls observer.observe(root, ...) unconditionally and synchronously, before the documentReady branch. Scoping to document.body therefore requires moving the observe call behind a body-present check and calling observe inside the DCL callback on the loading path; collectFromRoot becomes "body plus document.body.querySelectorAll('*')" and must test body itself. Nothing else in start.ts changes and isParticipant is untouched.

SETTLED DECISIONS: the attribute is the single source of truth; the runtime looks at the body, not the document; the bootstrap module ships with the package; built-in implementations only (names resolve against what src/index.ts exports, nothing else); the attribute takes the declared name — the first argument of each defineImplementation call — not the export identifier. The canonical seventeen, as the attribute must spell them: attributable, auto-grow, classable, copyable, dirtyable, focusable, formattable, logger, modifiable, no-propagate, pastable, prevent-default, renderable, requestable, revealable, storable, validatable. The exports noPropagate and preventDefault are reached by their kebab-case names. An unknown name is a loud runtime error naming the unknown name and listing what is available. start() remains exported and usable directly — programmatic callers, tests and test-harness.ts keep working unchanged; the declarative tag is the recommended path, not the only one.

OPEN FOR THE IMPLEMENTER: whether resolution is a static map in the bootstrap module or dynamic import() per name (recommend the static map, since the CDN build already ships everything); how the bootstrap module locates its script tag (recommend querying every script[implements], scoped to script, never a bare [implements], because it finds both tags in one pass for the union requirement, whereas import.meta.url finds only the instance that loaded the module and a second tag with the same src would not re-execute it). The implementer confirms and reports both.

## Requirements

- [ ] A bootstrap entry point ships in the package and is the documented way to start Interactably. It reads an implements attribute off the script tag that loaded it, resolves each space-separated name against the built-in implementations, registers them, and calls start() once. Tag lookup is scoped to script[implements].
- [ ] An empty or absent attribute registers nothing and still calls start(), so a page using only on-* triggers with no implementations works.
- [ ] An unrecognised name throws a clear error naming it and listing the available implementations. It does not fail silently and does not prevent the recognised ones from attaching.
- [ ] Two tags declaring implementations union their lists; start() still runs once (start() is already idempotent per root via its disposers WeakMap — verify this holds).
- [ ] With a Document root, start() scans and observes document.body (including the body element itself) instead of the whole document. isParticipant is unchanged. An Element root behaves as before. Covered by tests: a declaring <script implements> in the head has no attachment; <body implements="..."> does; an element added to the head after load with implements is never attached; an element added to the body after load is.
- [ ] start() and every named export in src/index.ts keep their current signatures. Nothing existing is removed from the public surface.
- [ ] The CDN build (rolldown.config.mjs, dist/cdn/) emits the bootstrap entry alongside the current core bundle.
- [ ] site/demo.src.js is deleted or reduced to nothing, and the generated site/demo.js with it. The seventeen side-effect imports plus start() is exactly the pattern this task removes; it must not survive as the site's own bootstrap.
- [ ] All 35 pages in site/examples/ are migrated. They currently load ../demo.js via <script type="module" src="../demo.js">. Each becomes a declarative tag naming the implementations that page actually uses — not a blanket list. Read each page's element-level implements attributes to derive the script tag's list.
- [ ] site/index.html is migrated: the Quick start snippet at ~line 59 and the prose at ~lines 36, 67 and 150 all teach start() as the entry point.
- [ ] site/docs.html is migrated: seven occurrences of start(). Those describing start() as the attachment mechanism (the participation rule, the observer) stay accurate and may keep the name; those teaching it as the thing an author calls must be rewritten.
- [ ] site/reference.html and site/fragments/ checked and migrated if they teach the old pattern.
- [ ] README.md is migrated: the hook at line 5 ("one start() call finds them all"), the snippet at lines 9-11, and the Quick start section at lines 24-37 which teaches importing the core bundle and calling start(). The participation rule at line 58 and the architecture note at line 163 describe mechanism and may keep the name if still true.
- [ ] AGENTS.md updated if it documents the bootstrap pattern.
- [ ] Tests cover: resolution of each of the seventeen built-ins by its declared name (including no-propagate and prevent-default), the unknown-name error, the empty-attribute case, the two-tag union, a script tag with implements producing no attachment, and <body implements="..."> still attaching.

## Verification

- pnpm run build then pnpm test pass with no new failures.
- pnpm run build:site succeeds and every example page still behaves — spot-check at least one page per implementation.
- grep -rn "start()" site/ README.md returns only occurrences that describe mechanism, none that instruct an author to call it.
- grep -rn "demo.js" site/ returns nothing.
- A page with <script implements="revealable"> attaches a revealable element; a page naming a nonexistent implementation logs a clear error and still attaches everything else. The script tag itself is never attached.
- Handoff lists which resolution strategy was chosen and why, and reports the per-page implementation lists derived for the examples.

## Prohibited Patterns

- Do NOT keep site/demo.src.js's import-list-plus-start() shape anywhere, including in docs as an alternative. It is the pattern being retired.
- Do NOT remove or change the signature of start(), or of any existing named export.
- Do NOT make the bootstrap resolve, fetch or analyse anything outside the package. No user implementations, no specifier resolution, no config file.
- Do NOT give a single example page a blanket list of all seventeen implementations. Each page declares what it uses.
- Do NOT fail silently on an unknown name.
- Do NOT query a bare [implements] selector when locating the bootstrap tag. Scope it to script[implements].
- Do NOT add a tag check or an exclusion list to isParticipant. Head content is kept out by scoping the scan to document.body, not by filtering.
- Do NOT drop the body element itself from the scan. querySelectorAll omits its root; test body explicitly.
- Do NOT throw when document.body is null at call time; defer to DOMContentLoaded as the loading path already does.
- Do NOT introduce a build step for consumers. The declarative tag must work on a static page loaded from a CDN with no tooling.
- Do NOT touch the parser, executor, phrase grammar or any implementation's verbs or events. This task changes only how implementations get registered.
