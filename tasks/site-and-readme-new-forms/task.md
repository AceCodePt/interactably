---
wait_human_start: false
wait_human_merge: false
dependencies: [arrow-function-values, remove-legacy-phrase-keys]
---

# Task: The site and README describe only the new forms

## Metadata

- **Complexity:** Medium
- **Priority:** Medium
- **Status:** Ready for Handoff

## Context

`site/docs.html` is the design document, `site/reference.html` the implementation catalogue, `site/examples.html` and `site/examples/` the working examples. They must describe and use only presence attributes and arrow-function values. The runtime tasks migrate markup mechanically to keep tests green; this task rewrites the prose and the grammar so the site reads as a coherent whole and no old form is mentioned.

Per AGENTS.md, any change to an implementation's tags, verbs, config, state or events stays in parity across docs.html, reference.html, the README table and the index.html chip.

## Requirements

- [ ] Rewrite `site/docs.html`: quick start, participation/receiver rule, trigger grammar, grammar block, constructs table, key filters, event values, intersect (margins as parameter fields, one observer per element, typed margins bind), the event-declaration section, the receiver section, and the API reference (`runEventValue`, `parseEventValue`, removed `parseEventAttribute`, removed phrase keys, removed `NotReadyError` if removed). Every example uses braced handlers and bare presence attributes.
- [ ] Rewrite `site/reference.html`: the grammar block, every per-implementation card's markup and signature tables, and the API table.
- [ ] Migrate `site/examples/` (all pages), `site/examples.html`, `site/fragments/`, `site/index.html` and `README.md` to the new forms: no `implements="`, no `on-x(`, no phrase keys, no backticked declaration literals, no concise bodies. Merge same-event attributes into one handler list.
- [ ] Remove the README note about coloned/bracketed attribute names tripping validators, and every other mention of the old forms outside an explicit migration-error example.
- [ ] Update the four-home tables and the API rows in `docs.html`, `reference.html`, `README.md` and `index.html` so the parity test passes; update site prose that names `implements` to name the implementation attribute instead.
- [ ] `node scripts/build-site.mjs` succeeds. Every example page runs in a browser (or the Playwright/jsdom site suite) with no console errors or warnings introduced by the migration.
- [ ] `pnpm build && pnpm check && pnpm test` pass on the committed tree.

## Verification

On the committed tree: `node scripts/build-site.mjs` succeeds and `pnpm build && pnpm check && pnpm test` pass. `rg -n 'implements="|on-[a-z-]+\(' site README.md` returns nothing. `rg -n 'on-[a-z-]+\(` site README.md` returns nothing. The four-homes parity test passes and every example page loads cleanly.

## Prohibited Patterns

- Do not leave any old form in a code block, example, table or prose passage; describe the removed form in words if it must be mentioned at all.
- Do not change the bootstrap script's `implementations="..."` attribute.
- Do not let `docs.html`, `reference.html`, the README and the index chips drift from each other.
- No `/tmp` scratch work; scratch lives in `<repo>/scratch/` and is deleted before finishing.
- No code comments unless requested.
