---
wait_human_start: false
wait_human_merge: false
dependencies: [interactably-12-utility-types]
---

# Task: Interactably-13-Storable-Rename

## Metadata

- **Complexity:** Low
- **Priority:** Medium
- **Status:** Ready for Handoff

## Context

Naming alignment: every other implementation is an -able adjective (modifiable, revealable, dirtyable), so storage becomes storable. The config DOM names are derived from the implementation name, so renaming the name to "storable" automatically turns storage-key/storage-type/storage-attr into storable-key/storable-type/storable-attr. Depends on interactably-12-utility-types to avoid colliding with the earlier import/type refactors.

## Requirements

- [ ] Rename the implementation directory registry/behaviors/storage/ to registry/behaviors/storable/ (git mv, preserving history), and the file storage.ts to storable.ts plus storage.test.ts to storable.test.ts.
- [ ] Rename the export const storage to storable and the defineImplementation name string from "storage" to "storable" so the config DOM names become storable-key, storable-type and storable-attr.
- [ ] Update every reference: src/index.ts export, rolldown.config.mjs implementation entry, the test's import path and all storage-* attributes/titles, and README section 9.4's rename-only row.
- [ ] `pnpm check`, `pnpm test` and `pnpm build` pass; the build emits dist/cdn/storable.js and no longer dist/cdn/storage.js.

## Verification

`pnpm check && pnpm test && pnpm build` pass; `rg -n '\\bstorage\\b' registry src tests rolldown.config.mjs README.md` matches only localStorage/sessionStorage and prose, never the implementation name; dist/cdn/storable.js exists and dist/cdn/storage.js does not.

## Prohibited Patterns

- Never create or write files under /tmp or any system temp directory; do scratch work in <repo>/scratch/ and delete it before finishing.
- Do not change any runtime behaviour of the implementation - this is a rename, not a rewrite.
- Do not add or remove runtime dependencies.
