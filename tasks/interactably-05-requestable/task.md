---
wait_human_start: false
wait_human_merge: false
dependencies: [interactably-04-value-impls]
---

# Task: Interactably-05-Requestable

## Metadata

- **Complexity:** High
- **Priority:** High
- **Status:** Ready for Handoff

## Context

Clean-room implementation slice 5 of the Interactably design (README.md §8.6, §9.4 request row, §10.2). Build requestable and validatable, the asynchronous seam: verbs are synchronous, a request starts in the verb and consumes its promise in the implementation's closure, and completion runs the implementation's own continuation phrases. Port the request logic from behavior-fn as reference only. Depends on interactably-04-value-impls. Tests use node:test with jsdom and must include the README §10.2 order-form end-to-end example. If a piece is too large you may create sub-tasks within README scope that depend on this task.

## Requirements

- [ ] registry/behaviors/requestable/: config { url, method, target, swap, include, concurrency, after, error } with DOM names requestable-*; state status mapped to data-status; verbs send() and abort(), both synchronous; one AbortController per element (README §9.4, §10.2).
- [ ] Concurrency policy is derived from the method: GET (idempotent) is latest-wins (abort the previous request), anything else is first-wins (refuse a new send while one is in flight); requestable-concurrency="latest | first | all" overrides (README §8.6).
- [ ] send() sets aria-busy synchronously before the fetch and clears it on settle; on success it swaps the response per target/swap then runs runPhrases(el, attrs.after, e.originalEvent); on failure it sets status=error and runs runPhrases(el, attrs.error, e.originalEvent); an AbortError runs neither continuation and logs nothing (README §8.6, §10.2).
- [ ] Continuations run only if the element is still connected; when the swap replaces the requestable element itself they are skipped (README §8.6).
- [ ] registry/behaviors/validatable/: tags [form, input, select, textarea], verb validate(undefined) calling el.reportValidity() and calling e.preventDefault() when it returns false, so the executor aborts the chain (README §10.2).
- [ ] Tests cover the README §10.2 traces: happy path, validation failure aborting before send, double submit under first-wins, server 500 running the error continuation, an unowned verb logging and stopping, and a response that replaces the form skipping the continuation.

## Verification

`pnpm check && pnpm test` pass; requestable and validatable tests exist and an order-form end-to-end test reproduces the README §10.2 traces (happy path, validation failure, double submit, 500, unhandled verb, outer swap).

## Prohibited Patterns

- Never create or write files under /tmp or any system temp directory; do scratch work in <repo>/scratch/ and delete it before finishing.
- Do not add runtime dependencies beyond auto-wc and tsyntax.
- Do not make verbs return a promise or make a chain await; verbs stay synchronous and continuations are separate phrases (README §8.6, §11.29).
- Do not reintroduce a request-trigger attribute or any Command Protocol trigger negotiation.
