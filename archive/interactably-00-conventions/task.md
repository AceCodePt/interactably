---
wait_human_start: false
wait_human_merge: false
dependencies: []
---

# Task: Interactably 00 — project conventions and verification harness

## Metadata

- **Complexity:** Low
- **Priority:** High
- **Status:** Ready for Handoff

## Context

README.md is the design contract for a clean-room implementation of Interactably, a trigger grammar and host for customized built-in web components. This anchor task records the working conventions every later slice must follow and confirms the verification harness. It is a real deliverable, not a placeholder: AGENTS.md is auto-read by agents, so it is where the /tmp prohibition, the dependency limit, and the test commands belong. behavior-fn (github.com/AceCodePt/behavior-fn) is reference only; no Command Protocol code is carried over. Downstream slices depend on this task and run sequentially so no merge conflicts arise. If a later slice is too large you may create additional sub-tasks with the task tool, as long as they stay within README scope and depend on the slice they extend.

## Requirements

- [ ] Create AGENTS.md at the repo root and document that README.md is the single source of truth for the design; reference its sections rather than restating the design.
- [ ] Document the working constraints: ESM with Node native type stripping (relative imports use explicit .ts extensions); pnpm; node:test is the only test runner; jsdom is a dev-only dependency; the only runtime dependencies are auto-wc and tsyntax.
- [ ] Document the verification commands: `pnpm check` (tsc --noEmit) and `pnpm test` (node --test) must both pass before a task is declared done.
- [ ] Document the strict tsconfig posture and that new code must type-check under it (no any, exactOptionalPropertyTypes, noUncheckedIndexedAccess).
- [ ] State the temp-file rule verbatim: never create or write files under /tmp or any system temp directory; do scratch work in <repo>/scratch/ and delete it before finishing.
- [ ] State that no code comments are added unless requested, and that the README's directory layout (registry/interactable/, registry/behaviors/) is authoritative.
- [ ] Do not implement the parser, executor, host, registry, or any implementation in this task.

## Verification

`pnpm check && pnpm test` pass on the committed tree; AGENTS.md exists and contains the /tmp prohibition, the dependency limit, and the two verification commands.

## Prohibited Patterns

- Never create or write files under /tmp or any system temp directory; do scratch work in <repo>/scratch/ and delete it before finishing.
- Do not add runtime dependencies beyond auto-wc and tsyntax.
- Do not implement parser/executor/host/registry/implementations in this task.
