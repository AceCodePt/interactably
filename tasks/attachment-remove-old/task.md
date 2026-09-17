---
wait_human_start: false
wait_human_merge: true
dependencies: [attachment-migrate-tests]
---

# Task: Remove the old path: interactable-host.ts, auto-loader, auto-wc, exports

## Metadata

- **Complexity:** Low
- **Priority:** Medium
- **Status:** Ready for Handoff

## Context

Slice 3 of drop-customized-builtins (brief order 3). Delete the old custom-element path now that nothing references it. Baseline green at main; the suite is fully on start()/isAttached from attachment-migrate-tests. See the drop-customized-builtins spec. README/site still describe is= until their own slices - do NOT touch them here.

## Requirements

- [ ] Delete registry/behaviors/interactable-host.ts, registry/utils/auto-loader.ts, registry/interactable/host.ts (IS_HOST/isHost); confirm registry/utils/auto-loader.test.ts is gone.
- [ ] package.json: remove auto-wc from dependencies; update the description (drop "customized built-in web components"); remove the "customized-built-ins" keyword.
- [ ] rolldown.config.mjs: drop the auto-loader entry; remove "auto-wc" from externals; coreFiles replaces registry/behaviors/interactable-host.ts with registry/interactable/attachment.ts + registry/interactable/start.ts.
- [ ] src/core.ts: export start in place of defineInteractableHost; drop the InteractableHost type export. src/index.ts: drop the installAutoLoader line.
- [ ] tests/smoke.test.ts: assert start is exported by the core and main bundles instead of defineInteractableHost. tests/site-smoke.test.ts: KNOWN_BUNDLES drops auto-loader; the EXTRA_HOST/defineInteractableHost regex machinery is removed.
- [ ] rg across src/, registry/, tests/ for auto-wc, auto-loader, installAutoLoader, defineInteractableHost, IS_HOST, isHost, interactable-host returns nothing.
- [ ] pnpm check, pnpm build and pnpm test all pass.

## Verification

pnpm check && pnpm build && pnpm test pass; rg -n 'auto-wc|auto-loader|installAutoLoader|defineInteractableHost|IS_HOST|isHost|interactable-host' src/ registry/ tests/ returns nothing.

## Prohibited Patterns

- Do not touch site/ or README.md (their is=/host prose is later slices).
- No on-load in attach().
- No code comments beyond the brief's.
