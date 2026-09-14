---
wait_human_start: false
wait_human_merge: false
dependencies: [interactably-17-github-pages-demo]
---

# Task: Interactably-18-De-Migrate-Readme

## Metadata

- **Complexity:** Medium
- **Priority:** Medium
- **Status:** Ready for Handoff

## Context

Full de-migration of the design doc. README.md currently frames Interactably as a replacement for behavior-fn (title, status/Supersedes line, a before/after summary, an Old->New terminology table, a whole section 9 of repository edits against behavior-fn's tree, and rationale asides). The user wants the README to read as a standalone design: scope is README.md only (AGENTS.md and .orchestration/README.md are already clean), the string behavior-fn and behavior-fn's own vocabulary must be gone, section 9 deleted, and the remaining sections renumbered. Depends on interactably-17-github-pages-demo so it runs after every other README edit (15 formula, 16 npm/imports, 17 demo). Docs-only: no code changes.

## Requirements

- [ ] README.md contains no occurrence of behavior-fn (case-insensitive) and none of behavior-fn's own vocabulary: behavior="...", behavioral-<tag>, uniqueBehaviorDef, _wireCommandDispatch, dispatchCommand, CommandEvent, behavior-registry.ts, behavior-utils.ts, behavioral-host.ts, command-protocol.md, @sinclair/typebox, TypeBox, or the command/commandfor Command Protocol attributes as behavior-fn's design.
- [ ] Retitle the document (drop 'replacing the Command Protocol in behavior-fn') and delete the Status/Scope/Supersedes migration line so the doc opens as a standalone design.
- [ ] Rewrite section 1 (Summary) as a self-contained introduction: no before/after against behavior-fn, no description of its current trigger plumbing. Keep an Interactably-only usage snippet.
- [ ] Rewrite section 2 (Terminology) as a plain glossary of Interactably's terms (implementation, verb, trigger, receiver, parser+executor, config, state, ...) with the Old->New mapping column removed.
- [ ] Delete section 9 (Repository changes) in full, including its New/Modified/Deleted/Per-implementation-migration/order subsections.
- [ ] Renumber the following sections consecutively: 10 Full examples -> 9, 11 Decisions -> 10, 12 Out of scope -> 11; update every in-text cross-reference to match (do the reference rewrite in the safe order: 10 -> 9 first, then 11 -> 10, so a newly created section number is never rewritten twice).
- [ ] Reword the remaining rationale asides that compare to behavior-fn or cite its files: section 5.1 (host 'the same class behavior-fn already has'), 5.2 ('the same principle behavior-fn already applies'), 5.3 ('uniqueBehaviorDef becomes defineImplementation'), 5.5 (behavior-utils.ts / no-propagate/behavior.ts), 8.5 (polyfill note), the Decisions section entries that name behavior-fn's TypeBox/command map/dirty-state, and the Appendix C intro and items.
- [ ] Keep the browser's native command/commandfor/command event discussion where it is about the platform API (for example the decision not to use the native Invoker Commands API and the native-invoker example), reworded so it never presents those as behavior-fn's design.
- [ ] `pnpm check` and `pnpm test` still pass (docs-only change).

## Verification

`rg -in 'behavior-fn|behavioral-|uniqueBehaviorDef|_wireCommandDispatch|dispatchCommand|behavior-registry|behavior-utils|behavioral-host|command-protocol|@sinclair|TypeBox|typebox|BehaviorDef' README.md` returns nothing; `rg -n '^## ' README.md` shows consecutive section numbers with no section 9 migration content and no gaps; every `§N` cross-reference in the file resolves to an existing section; `pnpm check && pnpm test` pass.

## Prohibited Patterns

- Never create or write files under /tmp or any system temp directory; do scratch work in <repo>/scratch/ and delete it before finishing.
- Do not edit any file other than README.md; this is a documentation rewrite, not a code change.
- Do not remove legitimate discussion of the browser's own native command/commandfor attribute and command event (the platform API) - only behavior-fn's Command Protocol and its vocabulary go.
- Do not renumber sections with a naive find-and-replace that corrupts the existing section 10 and 11 references; apply the renumbering in the order that keeps existing references intact.
