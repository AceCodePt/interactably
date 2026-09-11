---
wait_human_start: false
wait_human_merge: false
dependencies: [interactably-08-json-template]
---

# Task: Interactably-09-Cdn-Build

## Metadata

- **Complexity:** Medium
- **Priority:** Medium
- **Status:** Ready for Handoff

## Context

Packaging gap found in review: README §9.2's build-cdn bundles registry/interactable/* into a core file alongside the host, and README §10.1 imports per-implementation CDN entries (dist/cdn/modifiable.js and friends); the current build emits a single interactably.js. This slice reshapes the rolldown build to the README shape now that every implementation exists. Depends on interactably-08-json-template. If a piece is too large you may create sub-tasks within README scope that depend on this task.

## Requirements

- [ ] The rolldown build emits a core ESM bundle (registry/interactable/* plus the host) and one ESM entry per implementation under dist/cdn/, matching README §9.2 build-cdn and the import style of §10.1 (dist/cdn/modifiable.js, dist/cdn/requestable.js, and so on for every implementation).
- [ ] src/index.ts exports every implementation module and the full public API (defineImplementation, defineInteractableHost, registerImplementation, runPhrases, dispatchInteraction, InteractionEvent).
- [ ] package.json exports/files/main/module stay consistent with the emitted layout; `pnpm build` succeeds.
- [ ] A smoke test asserts the built core bundle loads and that at least one built implementation bundle imports cleanly under Node.
- [ ] `pnpm check && pnpm test` stay green after the reshape.

## Verification

`pnpm build` exits 0 and emits dist/cdn/*.js (core + one per implementation); `pnpm check && pnpm test` pass.

## Prohibited Patterns

- Never create or write files under /tmp or any system temp directory; do scratch work in <repo>/scratch/ and delete it before finishing.
- Do not add runtime dependencies beyond auto-wc and tsyntax; rolldown stays a dev-only tool.
- Do not ship source or tests in the published files; only the built output.
