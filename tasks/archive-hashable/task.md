---
wait_human_start: false
wait_human_merge: false
dependencies: []
---

# Task: Archive hashable — it has no live caller

## Metadata

- **Complexity:** Low
- **Priority:** Low
- **Status:** Ready for Handoff

## Context

The README audit left an open question: `hashable` has no live caller (after the intersect PR, nothing in site/ calls `this.hash()`). The user decided: no caller, list it as an archiving candidate, smoke test stays as written. Reasoning: the package-manager tabs on the docs page are a preference (a selected package manager), not a location — that is storable's job, which those tabs already do — and nobody sends a URL to say "read this with pnpm selected". On that page specifically, two hash uses would fight: a sidebar link sets `#hosts`, then a tab click's `replaceState` overwrites it with `#pm-pnpm`, degrading the one honest hash use on the page. `hashable` earns a caller only when a tab set is itself the destination (an "Overview / API / Changelog" switch where the panel is the page); the site does not have one, and inventing one to justify the implementation is how the scroll-spy hash came to be in the first place.

## Requirements

- [ ] Delete `registry/behaviors/hashable/` (hashable.ts and hashable.test.ts).
- [ ] Remove the `hashable` export at src/index.ts:17 and the `"hashable"` entry at rolldown.config.mjs:16; remove `import "./vendor/hashable.js";` at site/demo.js:17.
- [ ] Remove every hashable reference from docs: the Shipped-implementations table row (README.md:328, site/docs.html:498), the "### Hashable" section and its heading (README.md:390-391; site/docs.html:571-572, the h3 id="hashable" + paragraph inside sec-revealable), the `#hashable` Contents entry (README.md:40), the hashable entry in the API-reference implementations list (README.md:880, site/docs.html:1037), and the hashable ref card at site/reference.html:194.
- [ ] Remove `"hashable"` from KNOWN_BUNDLES in tests/site-smoke.test.ts (line 27).
- [ ] Leave the smoke test's `assert.equal(/this\.hash\(\)/.test(html), false, ...)` assertion exactly as written.
- [ ] Commit message notes the reason: no live caller — the package-manager tabs are a preference remembered by storable, not a shareable location, and a hash use on that page would fight the sidebar's own hash.

## Verification

`rg -n "hashable" --glob '!archive/**' --glob '!tasks/**' .` returns nothing outside archive/ and tasks/. `pnpm check` and `pnpm test` pass on a built tree (pnpm build first), with the site smoke test unchanged including its `this.hash()` assertion.

## Prohibited Patterns

- Do not give hashable a caller — no on-change or any phrase calling `this.hash()`/`hash()` anywhere, including the package-manager tabs.
- Do not alter the smoke test's `this.hash()` or `data-current` assertions in tests/site-smoke.test.ts.
- Do not touch the parser, executor, intersect module, or any implementation other than removing hashable.
