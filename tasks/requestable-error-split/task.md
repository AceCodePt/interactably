---
wait_human_start: false
wait_human_merge: false
dependencies: [event-declaration-literal-matching]
---

# Task: requestable errors split by shape, and the errors map deleted

## Metadata

- **Complexity:** Medium
- **Priority:** Medium
- **Status:** Ready for Handoff

## Context

requestable fires one request-error for three unrelated situations and smuggles a name through ImplementationEvent.key to tell them apart. That name comes from requestable-errors (a JSON config mapping status codes to author-chosen names) plus two built-in names, timeout and offline. The whole mechanism exists because a phrase could only filter on an opaque string key. Once events declare their values and backticked literals match them (the event-declaration-literal-matching dependency), the mapping layer has nothing left to do. The dependency slug in the original handoff (event-literal-matching) was corrected to event-declaration-literal-matching, which is the actual task on the board. The dependency is a hard prerequisite: it supplies the per-event field-schema/open-flag events map and the dispatch-path literal matching that on-request-error(status:`404`) relies on.

## Requirements

- [ ] requestable dispatches three distinct error events, each declaring only what it genuinely has: request-error with an open status:number field (the server replied, not with a success), request-timeout with no values (the request exceeded requestable-timeout), request-offline with no values (the fetch failed outright). The events map in registry/behaviors/requestable/requestable.ts declares these alongside response.
- [ ] response declares status:number alongside the payload html (open field set); requestable dispatches values { html, status } on success.
- [ ] requestable-errors config, parseErrorMap, and its three throw sites are removed from requestable.ts. dispatchError loses its key parameter and all key plumbing; request-error never carries ImplementationEvent.key.
- [ ] A non-ok response dispatches request-error with values.status; a timeout (TimeoutError reason) dispatches request-timeout; any other non-abort, non-timeout fetch rejection dispatches request-offline; abort() stays silent. The TypeError heuristic is dropped: every non-abort/non-timeout rejection is offline.
- [ ] registry/behaviors/requestable/requestable.test.ts: the offline test binds on-request-offline, the timeout test binds on-request-timeout, the requestable-errors map tests and the malformed-requestable-errors test are deleted, a literal-match test shows on-request-error(status:`401`) firing only on a 401, an unfiltered on-request-error still runs on any non-ok status, response and request-error carry status, request-timeout/request-offline carry no values, and abort() stays silent.
- [ ] Every site page is migrated: no page under site/ references requestable-errors. site/docs.html, site/reference.html, README.md and site/examples.html update their requestable rows/cards and their implementation-event lists to name request-timeout and request-offline; the 'Failures are partitioned' paragraph (docs.html:1043) is rewritten for the three events with status literal matching; keyed-implementation-event paragraphs (docs.html:306-308, 317 and README.md rule 4) no longer cite request-error as the keyed event; the API ImplementationEvent rows (docs.html:1158, reference.html:235, README.md:202) drop the failure-kind text; site/examples/offline-fallback.html (lede, form, and code block) moves from on-request-error="offline: #list.undo()" to on-request-offline="#list.undo()".
- [ ] site/examples/order-form.html and guarded-submit.html keep their unfiltered on-request-error="#alert.show()": a non-ok status still fires request-error, and the GitHub Pages no-backend failure path is a 404 response, not a rejection.
- [ ] tests/site-smoke.test.ts offline-fallback flow is updated for on-request-offline (its assertion message names request-offline instead of 'request-error with the offline key'); order-form and guarded-submit flows stay green untouched.
- [ ] site/docs.html gains an aria-live note in the requestable section: the library will not set aria-live — a live region must exist before its content changes or the update may not be announced, and choosing polite versus assertive is a judgement only the author can make; aria-busy is already handled and needs no author action.

## Verification

On the committed tree: pnpm run build then pnpm test and pnpm run check all pass. Concretely: no occurrence of requestable-errors or parseErrorMap anywhere in the repo; requestable.test.ts exercises the three events (status-carrying request-error with a literal match on a status, request-timeout with no values, request-offline with no values) and abort() silence; response carries status; site/docs.html, site/reference.html, README.md, site/examples.html, site/examples/offline-fallback.html are migrated; tests/site-smoke.test.ts four-homes parity stays green and the docs body loads without console.warn/error.

## Prohibited Patterns

- Do not keep requestable-errors or parseErrorMap in any form; the mapping layer is deleted, not renamed.
- Do not dispatch request-error with a key; request-error partitions by status value only.
- Do not add events for request start, request abort, or before-request; those are explicitly out of scope.
- Do not reintroduce a TypeError-vs-other distinction as a separate event; every non-abort, non-timeout rejection is offline.
- Do not implement the event-declaration-literal-matching dependency here; that is its own task and must be archived before this one dispatches.
- No code comments unless requested; no scratch files left behind.
