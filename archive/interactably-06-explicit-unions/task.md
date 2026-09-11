---
wait_human_start: false
wait_human_merge: false
dependencies: [interactably-05-requestable]
---

# Task: Interactably-06-Explicit-Unions

## Metadata

- **Complexity:** Medium
- **Priority:** High
- **Status:** Ready for Handoff

## Context

Enforcement slice for the project signature rule stated in AGENTS.md and README §5.3/§11.19: when a config, state or verb scalar has a finite set of legal values it must be an explicit tsyntax union, never a bare `string`; internal non-DSL values use an explicit TypeScript union type. This slice runs after interactably-05-requestable and before packaging so the audit covers every implementation, including fields produced by the already-running interactably-04-value-impls (notably format(kind)). It does not modify the running task; it corrects the committed result. If a piece is too large you may create sub-tasks within README scope that depend on this task.

## Requirements

- [ ] Audit every implementation under registry/behaviors/ and every config, state and verb scalar signature for fields whose legal values form a finite set.
- [ ] Replace a bare `string` with an explicit tsyntax union string for any such field; use an explicit TypeScript union type for internal non-DSL values (README §5.3, §11.19; AGENTS.md Signatures).
- [ ] Verify the requestable fields method/concurrency/swap/status are explicit tsyntax unions and correct them if not: method "'get' | 'post' | 'put' | 'delete' | 'patch' | undefined", concurrency "'latest' | 'first' | 'all' | undefined", swap "'innerHTML' | 'outerHTML' | 'beforebegin' | 'afterbegin' | 'beforeend' | 'afterend' | 'delete' | 'none' | undefined", status "'idle' | 'loading' | 'error' | undefined" (README §8.6, §9.4, §10.2).
- [ ] Give format(kind) an explicit union of the kinds the implementation actually supports, and do the same for any other verb that takes a fixed vocabulary (README §9.4).
- [ ] Add tests asserting that a value outside each finite set is rejected at runtime, and leave genuinely open-ended fields as bare `string`.
- [ ] Produce a short audit report (in the task log, not committed as a new doc) listing each audited field and its final signature.

## Verification

`pnpm check && pnpm test` pass; every finite-value field under registry/behaviors/ is an explicit tsyntax union (or TS union for internal values), and tests reject out-of-set values for requestable-method, requestable-concurrency and format(kind).

## Prohibited Patterns

- Never create or write files under /tmp or any system temp directory; do scratch work in <repo>/scratch/ and delete it before finishing.
- Do not add runtime dependencies beyond auto-wc and tsyntax.
- Do not convert genuinely open-ended fields (selectors, URLs, free text, the comma-separated events lists in no-propagate/prevent-default) into unions.
- Do not change any runtime behaviour; this is a signature/typing correction only.
