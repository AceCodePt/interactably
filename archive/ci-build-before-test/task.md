---
wait_human_start: false
wait_human_merge: false
dependencies: []
---

# Task: CI builds before it tests; the site test reads `dist/site/demo.js`

## Metadata

- **Complexity:** Low
- **Priority:** Medium
- **Status:** Ready for Handoff

## Context

`expressions-inline` (`2fdf45b`) replaced the site smoke test's `t.skip("dist not built")` with a hard assertion. That was the right call — a skipped guard is no guard — but every workflow still runs `pnpm test` before `pnpm build` (`ci.yml:29-30`, `pages.yml:38-39`, `publish.yml:33-34`), so the two site tests fail on every push. Locally the suite is 518/518 after `pnpm build && pnpm build:site`.

The test also asserts on the wrong file. It reads `site-dist/demo.js` (`site-smoke.test.ts:16,85-92,121,340`), which only `pnpm build:site` produces, so the test path needs three commands and `AGENTS.md:26` documents all three. The artifact the test exists to guard is `dist/site/demo.js` — what `pnpm build` produces via the fifth rolldown config. `site-dist/` is a copy of it plus static assets, and matters only to `pages.yml`.

## Requirements

- [ ] Workflow order in all three files: `pnpm check` → `pnpm build` → `pnpm test`. `pages.yml` keeps `node scripts/build-site.mjs` after `pnpm test`.
- [ ] `tests/site-smoke.test.ts`: `siteDistDemo` becomes `siteBundle = new URL("../dist/site/demo.js", import.meta.url)`; both `existsSync` assertions (l.85, l.340) and the `import()` (l.121) use it; messages say `dist/site/demo.js is missing; run pnpm build first`. The single-file assertion (l.89-92) reads the same file. No test reads `site-dist/`.
- [ ] `AGENTS.md:26` becomes: `pnpm test` requires `pnpm build` first — the site tests load `dist/site/demo.js`; run `pnpm build && pnpm test` on a fresh checkout. `pnpm build:site` is a Pages concern and is not needed for the suite.
- [ ] `rg -n "site-dist" tests/` returns nothing.

## Verification

```
rm -rf dist site-dist && pnpm build && pnpm test      # 518 pass, no build:site
rm -rf dist && pnpm test 2>&1 | grep "dist/site/demo.js is missing"   # the two site tests fail with that message
```
CI green on the PR.

## Prohibited Patterns

- No `t.skip` back in — a missing bundle is a failure with a message naming the command.
- No `pnpm build:site` in `ci.yml` or `publish.yml`; no `site-dist` path in any test.
- No `test` script that shells out to `build`; the order lives in the workflows and `AGENTS.md`.
