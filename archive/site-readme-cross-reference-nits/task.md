---
wait_human_start: false
wait_human_merge: false
dependencies: []
---

# Task: Fix four documentation cross-reference defects in AGENTS.md, README.md, and the roving-focus example

## Metadata

- **Complexity:** Low
- **Priority:** Low
- **Status:** Ready for Handoff

## Context

Four small documentation defects found during the site-canonical review. None affect behaviour, but each tells a reader something untrue. Note the brief's file references for defect 4 are stale: #code-ex-combobox lives in site/examples/roving-focus.html (demo at lines 43-62, code block at 74-87), not site/examples.html, which is only 217 lines.

## Requirements

- [ ] AGENTS.md line 5: the sentence says README's directory layout is authoritative, but README no longer describes the layout; AGENTS.md does. Reword 'Its directory layout is authoritative' to make the layout AGENTS.md's own claim (e.g. 'This file's directory layout is authoritative').
- [ ] README.md line 138 (prevent-default row): the config cell reads `events` (derived, see below) and there is nothing below. Replace 'see below' with the derivation inline: the element's on-submit/on-click/keyed on-keydown, else submit on a form, click on a[href]/button (per registry/behaviors/prevent-default/prevent-default.ts:5-25).
- [ ] README.md line 139 (revealable row): the link text 'below' points at docs.html#revealable. Rename the link text to match its target, using the repo's existing style, e.g. ([§ revealable](https://acecodept.github.io/interactably/docs.html#revealable)).
- [ ] site/examples/roving-focus.html: reconcile the live demo (lines 43-62) and the #code-ex-combobox code block (lines 74-87). Option A: the code block must be the demo's markup - 5 cities (Berlin, Lisbon, London, Paris, Tokyo), cb- prefixed ids (cb-search, cb-results, cb-results-1..5), the demo's type="button" and placeholder, and the wrap cb-results-5 -> cb-results-1. Keep the existing positional-ids explanatory comment.
- [ ] Do not edit site/docs.html line 493's '(derived, see below)' - the prevent-default section does follow it there, so that reference is accurate.
- [ ] Do not attempt to generate example snippets from demo markup; snippets deliberately show more than the demo (e.g. suggest-as-you-type.html lists fetched fragment options absent from the demo's empty ul).

## Verification

pnpm check passes; pnpm build && pnpm test passes on the committed tree (the site-smoke README-anchor test and the README 260-line ceiling both still hold).

## Prohibited Patterns

- No behaviour or implementation changes; this is documentation only.
- No new build-time code generation for example snippets.
- No edits to files outside AGENTS.md, README.md, and site/examples/roving-focus.html.
