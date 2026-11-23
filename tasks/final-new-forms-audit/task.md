---
wait_human_start: false
wait_human_merge: false
dependencies: [language-server-new-forms]
---

# Task: No old form survives anywhere

## Metadata

- **Complexity:** Low
- **Priority:** Low
- **Status:** Ready for Handoff

## Context

Final audit after the runtime, tests, site, README and language server have migrated. The user asked that support move entirely to the new paradigm and that the old form is not mentioned anywhere, so this task removes leftovers, dead exports and dead documentation rather than adding features.

## Requirements

- [ ] Search the whole repository excluding `archive/` and `node_modules` for `implements=`, `on-<event>(...)` names, `parseEventAttribute`, `EventAttribute`, `EventValueDeclaration`, `isIntersectAttribute`, phrase keys, backticked declaration literals and concise bodies.
- [ ] Remove every leftover, including dead exports from `src/core.ts`, dead types, dead test fixtures and documentation passages that describe the old behaviour as current. Migration-error tests are the only allowed mentions.
- [ ] Update `packages/language-server/README.md` and the package description if they describe the old grammar.
- [ ] Confirm the four homes and the API tables agree with the final runtime.
- [ ] `pnpm build && pnpm check && pnpm test` pass on the committed tree.

## Verification

On the committed tree: `pnpm build && pnpm check && pnpm test` pass. `rg -n 'implements="|on-[a-z-]+\(|parseEventAttribute|isIntersectAttribute|keyStart|keyEnd' . --glob '!archive/**' --glob '!node_modules/**'` matches only migration-error tests. `rg -n 'parseEventAttribute|EventValueDeclaration' src registry tests packages site README.md` returns nothing.

## Prohibited Patterns

- Do not add features or change semantics in this task.
- Do not touch `archive/`.
- Do not leave a dead export or a documentation mention of a removed form.
- No `/tmp` scratch work; scratch lives in `<repo>/scratch/` and is deleted before finishing.
- No code comments unless requested.
