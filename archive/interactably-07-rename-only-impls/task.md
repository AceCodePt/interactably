---
wait_human_start: false
wait_human_merge: false
dependencies: [interactably-06-package]
---

# Task: Interactably-07-Rename-Only-Impls

## Metadata

- **Complexity:** High
- **Priority:** High
- **Status:** Ready for Handoff

## Context

Coverage gap found in review: README §9.4's final row lists `auto-grow`, `json-template`, `storage`, `paste-transform` and `condition` as implementations that carry over with only the vocabulary rename, but none exist in the clean-room tree. This task ports the four non-template ones (auto-grow, storage, paste-transform, condition); json-template is its own follow-up because of its size. Port logic from behavior-fn (github.com/AceCodePt/behavior-fn, registry/behaviors/*) as reference only, expressed through defineImplementation and the new host. Depends on interactably-06-package. If a piece is too large you may create sub-tasks within README scope that depend on this task.

## Requirements

- [ ] registry/behaviors/auto-grow/: attaches to textarea, grows to scrollHeight on input, sets overflow-y hidden and resize none (README §9.4).
- [ ] registry/behaviors/storage/: persists and restores element state through Web Storage with the behavior-fn semantics, expressed as config/state and verbs (README §9.4).
- [ ] registry/behaviors/paste-transform/: transforms pasted text per its config (README §9.4).
- [ ] registry/behaviors/condition/: conditional behaviour per the behavior-fn implementation (README §9.4).
- [ ] Each implementation declares only invented config/state and uses explicit tsyntax unions for any finite value set (AGENTS.md Signatures).
- [ ] src/index.ts re-exports each new implementation module.
- [ ] Each implementation has node:test + jsdom tests covering its core behaviour.

## Verification

`pnpm check && pnpm test` pass; registry/behaviors/{auto-grow,storage,paste-transform,condition}/ exist with tests and are exported from src/index.ts.

## Prohibited Patterns

- Never create or write files under /tmp or any system temp directory; do scratch work in <repo>/scratch/ and delete it before finishing.
- Do not add runtime dependencies beyond auto-wc and tsyntax.
- Do not use the command attribute/event or any Command Protocol code.
- Do not invent finite value sets as bare strings; follow AGENTS.md Signatures.
