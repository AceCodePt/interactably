---
wait_human_start: false
wait_human_merge: false
dependencies: [interactably-05-requestable]
---

# Task: Interactably-06-Package

## Metadata

- **Complexity:** Medium
- **Priority:** Medium
- **Status:** Ready for Handoff

## Context

Final clean-room slice of the Interactably design (README.md §9.1, §9.2 build-cdn, §11.13) plus the explicit project requirement to export ESM with rolldown. Wire the public entry point, the rolldown build, and package.json exports/files. rolldown is a dev-only build tool, not a library dependency. Depends on interactably-05-requestable. If a piece is too large you may create sub-tasks within README scope that depend on this task.

## Requirements

- [ ] Add src/index.ts as the public entry point re-exporting defineImplementation, defineInteractableHost, registerImplementation, runPhrases, dispatchInteraction, InteractionEvent and the generic implementation modules (README §9.1, §11.13).
- [ ] Add a rolldown config that builds the ESM output (dist/) from the entry, bundling registry/interactable/* with the host as README §9.2's build-cdn describes; it is a dev-only tool and must not appear as a runtime dependency.
- [ ] Update package.json with the correct exports, files, main/module and a working build script; `pnpm build` must succeed and produce ESM.
- [ ] Add a dispatchInteraction test helper (replacing the old dispatchCommand) that dispatches the event, rethrows e.error, fails on !e.handled and returns e.result, plus a fire(el, type, init?) helper for the full trigger path (README §9.2).
- [ ] The existing test suite stays green after packaging.

## Verification

`pnpm check && pnpm test` pass and `pnpm build` exits 0 producing ESM output under dist/.

## Prohibited Patterns

- Never create or write files under /tmp or any system temp directory; do scratch work in <repo>/scratch/ and delete it before finishing.
- Do not add runtime dependencies beyond auto-wc and tsyntax.
- Do not ship source or tests in the published files; only the built output and the registry as README §9.2 specifies.
