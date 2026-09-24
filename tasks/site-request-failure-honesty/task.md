---
wait_human_start: false
wait_human_merge: false
dependencies: []
---

# Task: Site examples handle every request failure, honestly

## Metadata

- **Complexity:** Low
- **Priority:** High
- **Status:** Ready for Handoff

## Context

Commit `3aedc99` split `requestable`'s single `request-error` into three events: `request-error` (a non-ok status, carrying `status`), `request-timeout` (the configured timeout elapsed) and `request-offline` (any other rejection, typically a network `TypeError`). The library side is correct and fully tested — `registry/behaviors/requestable/requestable.test.ts` covers all three branches and the `latest`-policy swallow. The decision that there is no single catch-all failure event stands: an author who wants to catch every failure writes three attributes.

The site did not follow the split through. Before it, one `on-request-error` on a page caught everything, so each page's single handler was complete. After it, each page kept one handler and became a third-covered. The three pages that POST to a fake `/api/*` endpoint are the ones this bites, because on the published GitHub Pages site every such POST is answered with a non-ok status (404 or 405 — the endpoint does not exist), so `request-error` is the failure every visitor actually gets:

- `site/examples/offline-fallback.html` declares only `on-request-offline="#of-list.undo()"`. With the network on, the optimistic row renders, the request fails with a status, nothing fires, and the row stays — indistinguishable from success. This is the reported bug. Its lede and demo note also describe only the network-down case.
- `site/examples/guarded-submit.html` declares `on-request-error="#gs-alert.show()"`, but `#gs-alert`'s text is "Enter a valid email address." A server status is shown as a validation failure. Validation is already handled on the submit line (`this.validate().send() || #gs-alert.show()`); the request failure needs its own alert with its own text. It is deaf to `request-offline` and `request-timeout`.
- `site/examples/order-form.html` is the only one whose handler is honest ("Couldn't place the order." on `request-error`), and it is deaf to the other two.

The three GET pages (`network-quote`, `suggest-as-you-type`, `todo-list`) fetch real fragments under `site/fragments/` and succeed on the site; they declare no failure handling and this task leaves them alone.

Two facts an agent needs before editing:

- `renderable`'s `undo()` is one slot by decision (`registry/behaviors/renderable/renderable.ts`, `last`). Two sends before the first failure leaves the older row orphaned. The optimistic demo must say "send once" rather than pretend otherwise.
- `requestable` declares `state: { status: "'idle' | 'loading' | 'error' | undefined" }` but never assigns `"idle"` — the code sets `"loading"`, `"error"` or `undefined`. The type promises a value that cannot occur, and `site/reference.html` / `README.md` repeat it wherever they list the state.

`tests/site-smoke.test.ts` already has a `fakeResponse(ok, status, body)` helper (line ~139) and a `globalThis.fetch` shim recording `fetchCalls` (line ~206); the new site tests use those rather than adding a second shim. `tests/snippet-drift.test.ts` will fail on any live/snippet mismatch, so every attribute change lands in both.

## Requirements

- [ ] `offline-fallback.html`: the form declares `on-request-error`, `on-request-timeout` and `on-request-offline`, each running `#of-list.undo()`. The lede says the row rolls back on *any* failure, names the two a visitor can produce here — a missing endpoint with the network on, a network failure with it off — and the demo note says to send once and why (`undo` keeps one render).
- [ ] `guarded-submit.html`: a new hidden `revealable` alert with `role="alert"` and server-failure text (e.g. "Couldn't sign up — the request failed."); `on-request-error`, `on-request-timeout` and `on-request-offline` each show it; the submit line's `show(false)` resets it alongside the others; `#gs-alert` keeps its validation text and is shown only by the `||` branch.
- [ ] `order-form.html`: `on-request-timeout` and `on-request-offline` added, each showing `#alert`, whose text stays "Couldn't place the order."
- [ ] Every attribute change is mirrored in the page's `<details class="example-code">` snippet with the snippet's short ids; `tests/snippet-drift.test.ts` passes.
- [ ] `requestable`'s `status` state type drops `'idle'` (`registry/behaviors/requestable/requestable.ts`); every listing of that state in `site/docs.html`, `site/reference.html` and `README.md` drops it too. Grep for `idle` to find them all.
- [ ] Site tests in `tests/site-smoke.test.ts` for each of the three pages drive one `fakeResponse(false, 405, "")` and one `TypeError` rejection through the shimmed fetch and assert the page's response: the optimistic row is removed; the server-failure alert is visible and the validation alert is not; the order alert is visible. One test may cover a page's two failures.

## Verification

`pnpm run build`, `pnpm test` and `pnpm run check` pass. `pnpm run build:site` passes.
The built `offline-fallback` page, opened from `site-dist` with the network on, removes the row after Send; with DevTools offline it removes the row after Send; a second Send after a failure renders and removes again. The built `guarded-submit` page shows the server-failure alert, not the email alert, after a valid email is submitted.
Handoff lists any page where the three attributes read as noise and says whether the three-line shape wants a docs paragraph of its own.

## Prohibited Patterns

- No catch-all failure event, no `request-failed`, no reserved keys on `request-error`, no wildcard in event names. Three attributes is the design.
- No mock server, service worker, fetch monkey-patch or `demo.js` change to make `/api/*` succeed. The site is static; the examples say so.
- No change to `requestable`'s classification or dispatch order; no `undo` stack.
- No reuse of `#gs-alert` for the server failure. The two messages mean different things.
- GET pages are out of scope.
