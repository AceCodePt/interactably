---
wait_human_start: false
wait_human_merge: false
dependencies: [interactably-16-npm-publish-readiness]
---

# Task: Interactably-17-Github-Pages-Demo

## Metadata

- **Complexity:** High
- **Priority:** Medium
- **Status:** Ready for Handoff

## Context

A public demo at https://acecodept.github.io/interactably/ that actually exercises the library (hosts, implements, on-* triggers, the modifiable-formula DSL). The package is now publish-ready but not yet on the registry, so the site consumes the locally built CDN bundles rather than a registry URL: the Pages workflow builds the package, vendors dist/cdn into the site, and deploys. Depends on interactably-16-npm-publish-readiness so the bundle names and README are final. Human prerequisite (not automatable here): enabling GitHub Pages with Source = GitHub Actions in the repo settings.

## Requirements

- [ ] Add a site/ directory with index.html, styles.css and a demo module that uses interactably declaratively: interactable hosts via is="interactable-<tag>", implements, on-* triggers and verbs, including the modifiable-formula DSL (a computed total such as format(sum('#list .amount'), { style: 'currency', currency: 'USD' })) plus at least one other implementation (for example revealable or requestable).
- [ ] Make the demo actually run in a browser: the elements must be upgraded (define hosts before the elements exist, or use the auto-loader, building it to dist/cdn if it is not already there), and the site must not depend on the registry (it imports the local dist/cdn bundles via an import map or relative module specifiers).
- [ ] Add a site build step (e.g. scripts/build-site.mjs and a package.json script) that copies dist/cdn/*.js into site/vendor/ so the HTML resolves its imports when served statically; site/vendor must be gitignored.
- [ ] Add .github/workflows/pages.yml: on push to main touching site/** (and workflow_dispatch), run pnpm install/build, vendor the bundles, then configure-pages/upload-pages-artifact/deploy-pages with pages: write and id-token: write permissions.
- [ ] Add a runnable smoke test (node:test) that proves the demo wiring is coherent without a browser: it parses site/index.html, asserts every referenced vendor bundle corresponds to a built dist/cdn file (or a known implementation), and exercises at least one interaction under jsdom (skipping cleanly when dist is not built, like tests/smoke.test.ts).
- [ ] `pnpm check`, `pnpm test` and `pnpm build` pass.

## Verification

`pnpm check && pnpm test && pnpm build` pass; after `pnpm build && node scripts/build-site.mjs`, every ./vendor/*.js referenced by site/index.html exists and site/vendor is gitignored; the jsdom smoke test upgrades the demo elements and asserts an interaction (e.g. the computed total) works; the pages workflow is valid YAML and its steps reference the existing build and vendor scripts.

## Prohibited Patterns

- Never create or write files under /tmp or any system temp directory; do scratch work in <repo>/scratch/ and delete it before finishing.
- Do not reference behavior-fn anywhere in the site - it uses the interactably bundles.
- Do not add or remove runtime dependencies.
- Do not commit the generated site/vendor bundles; they are build output.
