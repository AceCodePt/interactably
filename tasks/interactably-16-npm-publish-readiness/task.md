---
wait_human_start: false
wait_human_merge: false
dependencies: [interactably-15-retire-summable-counter-format]
---

# Task: Interactably-16-Npm-Publish-Readiness

## Metadata

- **Complexity:** Medium
- **Priority:** High
- **Status:** Ready for Handoff

## Context

The package is not publishable: private, version 0.0.0, no repository/homepage/bugs/sideEffects/engines, no LICENSE, and the CDN core bundle still ships under the old brand name behavior-fn-core.js. The name interactably is free on the registry and the runtime deps (auto-wc, tsyntax) are published. npm CLI is blocked by devEngines.packageManager, so publishing goes through pnpm. Decided with the user: start at 0.1.0, rename the core bundle to interactably-core, and add a tag-triggered GitHub Actions publish workflow with provenance rather than publishing by hand. Depends on interactably-15-retire-summable-counter-format so the README and file set are final.

## Requirements

- [ ] Set package.json version to 0.1.0 and remove the private flag so the package can be published.
- [ ] Add repository (git+https://github.com/AceCodePt/interactably.git), homepage (https://acecodept.github.io/interactably/), bugs (the GitHub issues URL), an engines.node floor of >=20, and a sideEffects list that covers dist/cdn/*.js and dist/interactably.js so the custom-element registration side effects survive tree-shaking.
- [ ] Tidy the exports map to "." (types + import), "./cdn/*" (types + import) and "./package.json", and confirm the referenced dist/types and dist/cdn .d.ts paths exist after a build.
- [ ] Add an MIT LICENSE file at the repo root (holder AceCodePt).
- [ ] Rename the CDN core bundle from behavior-fn-core to interactably-core everywhere: rolldown.config.mjs (coreSpecifier and the core output file), scripts/rewrite-dts-imports.mjs (the behavior-fn-core.d.ts output), tests/smoke.test.ts, and every README import example.
- [ ] Rewrite README install/consumption examples from behavior-fn/dist/cdn/... to interactably/dist/cdn/... and document `npm install interactably`; keep the examples consistent with the current implementation names.
- [ ] Add .github/workflows/publish.yml: triggered on v* tags (and/or a published release), installing with pnpm, running check/test/build, then `pnpm publish --provenance --access public --no-git-checks` using a NPM_TOKEN secret, with id-token: write for provenance.
- [ ] `pnpm check`, `pnpm test` and `pnpm build` pass, and `pnpm pack --dry-run` lists the built dist tree plus LICENSE/README.

## Verification

`pnpm check && pnpm test && pnpm build` pass; `pnpm pack --dry-run` lists dist/interactably.js, dist/cdn/interactably-core.js and LICENSE; `rg -n 'behavior-fn-core' .` (excluding node_modules/.git) finds nothing; package.json has no private flag and version 0.1.0.

## Prohibited Patterns

- Never create or write files under /tmp or any system temp directory; do scratch work in <repo>/scratch/ and delete it before finishing.
- Do not actually publish to the registry - this task makes the package publish-ready and adds the workflow; the first publish is a human step with credentials.
- Do not set sideEffects to false: the CDN bundles and the main bundle register custom elements at import time.
- Do not add or remove runtime dependencies.
