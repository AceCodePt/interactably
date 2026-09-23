---
wait_human_start: false
wait_human_merge: false
dependencies: []
---

# Task: requestable — timeout and error filtering

## Metadata

- **Complexity:** Medium
- **Priority:** High
- **Status:** Ready for Handoff

## Context

requestable dispatches a single request-error for every failure (offline, timeout, 404, 401, 500) so they all must get the same response — rendering an optimistic local row after a 401 is actively wrong, and there is no timeout so an offline fallback can fire thirty seconds late. Partition each failure by what happened: a fetch rejection with a TypeError means the browser never got a response (offline); the composed timeout signal firing means slow (timeout); a non-ok response resolves its status through an author-declared map. The two reserved names are precisely "we never heard back". Abort stays the one silent case. Filtering reuses the existing colon-prefix phrase syntax, which the executor already matches against ImplementationEvent.key — the only gap is that the comparison runs through normaliseRootMargin (intersect is the sole keyed user so far), so it must become an exact match with root-margin normalisation applied only for intersect event names.

## Requirements

- [ ] requestable-timeout config, milliseconds, signature 'number | undefined'; undefined means no timeout. Composed into the existing AbortController signal so a timeout aborts with a TimeoutError reason, distinct from the AbortError of a user or concurrency abort.
- [ ] requestable-errors config: a JSON object map of status number to author-chosen failure name, e.g. requestable-errors='{"401": "unauthorized", "404": "missing"}'. tsyntax is scalars-only, so the signature is the open-ended 'string | undefined' and the behavior JSON.parses and shape-checks it as number -> string.
- [ ] request-error carries the failure kind as ImplementationEvent.key (the field already exists) so the colon-prefix phrase syntax matches it: on-request-error="timeout: ..." fires only for a timeout, on-request-error="unauthorized: ..." only for a 401.
- [ ] Reserved, library-owned kinds: timeout (the timeout signal fired, error name TimeoutError) and offline (fetch rejected with a TypeError — no response, fast). navigator.onLine is never consulted.
- [ ] A non-ok response resolves its status through the author's map. A failure whose status has no mapping dispatches request-error with no key: an unfiltered on-request-error phrase still catches it, and no keyed phrase matches.
- [ ] abort() stays silent as today (AbortError, no request-error). A timeout is not an abort.
- [ ] Executor: a keyed ImplementationEvent matches phrase.key by exact string; root-margin normalisation applies only to INTERSECT_EVENT_NAMES events. Files executor.ts and executor.test.ts are in scope with regression tests.
- [ ] Test fake fetch in requestable.test.ts rejects with the signal's actual reason (signal.reason) instead of a synthesized AbortError so TimeoutError vs AbortError stay distinguishable; handle AbortSignal.timeout availability in the jsdom test environment.
- [ ] Tests covering: offline (TypeError rejection -> key 'offline'), timeout (tiny ms, signal fires -> key 'timeout'), mapped status (401 + map -> key 'unauthorized'), unmapped status (-> no key, unfiltered handler still runs), abort-is-not-timeout (user abort -> silent).
- [ ] Docs parity per the site-smoke parity test: the new tags/config/events update the table in docs.html, the card in reference.html, the row in the README table, and the chip in index.html.
- [ ] Timeouts are one-shot per send: a timed-out request must not also count as a concurrency supersede and must finish() exactly once.

## Verification

pnpm check passes and pnpm build && pnpm test passes on the committed tree. The five new scenarios in requestable.test.ts each assert the dispatched request-error event's key (or its absence) and that the status/aria-busy bookkeeping resolves: offline and timeout dispatch with their reserved keys, a mapped status dispatches the mapped name, an unmapped status dispatches with no key while an unfiltered on-request-error still runs, and a user abort() dispatches nothing. executor.test.ts keeps every existing keyed-event test green and adds exact-match coverage for a keyed ImplementationEvent on a non-intersect event type.

## Prohibited Patterns

- Do not gate offline detection on navigator.onLine: the flag is only trustworthy when it says false, and gating would push a dead connection with onLine true into the unfilterable bucket.
- Do not introduce a closed client/server vocabulary or any new grammar; reuse the existing colon-prefix phrase syntax.
- Do not dispatch request-error on abort(); abort stays silent.
- Do not declare requestable-errors as a tsyntax object signature; tsyntax supports scalars only.
- Do not change the tsyntax signature of the timeout config beyond number | undefined.
