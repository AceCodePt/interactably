---
wait_human_start: false
wait_human_merge: false
dependencies: [event-value-binding]
---

# Task: requestable stops swapping and hands its payload to render

## Metadata

- **Complexity:** High
- **Priority:** Medium
- **Status:** Ready for Handoff

## Context

`requestable` and `renderable` both end in "put markup somewhere with a swap mode", and the only difference is provenance. That duplication across two vocabularies is what prompted a proposed merge behind a `from` source keyword.

The merge was rejected. `method`, `include`, `concurrency`, `timeout` and `errors` are meaningless when the source is a template, and a flat per-key signature language cannot express "this key requires `from` to be a URL" without dependent types. More tellingly, those keys do not describe a *source* at all — they describe a *request*. A URL is not a source in the sense a template is: one is a value you read, the other a negotiation with a server.

So the seam is drawn between negotiation and placement rather than between two kinds of source.

`requestable` owns the negotiation: `url`, `method`, `include`, `timeout`, `concurrency`, `errors`, `status`, the in-flight controller set, the timeout timers and `aria-busy`. It produces a payload and announces it. It no longer touches the DOM. `renderable` owns placement: template or payload, `swap`, `target`, the view transition, the completion event.

A cross-implementation call was considered — `requestable` invoking `renderable` directly on the same element — and rejected. `ensureImplementation` is called from exactly one place, `attachment.ts`, and no implementation anywhere reaches for another; this would be the first such dependency in the library, and it breaks the copy-in model, since taking `requestable` would silently require `renderable`. Coupling goes through the grammar, where an author can read it.

## Requirements

- [ ] `requestable` performs no DOM mutation: remove `applySwap` (registry/behaviors/requestable/requestable.ts:255) and the `target` and `swap` config keys, along with imports it no longer needs.
- [ ] `response` declares its payload per the event-value binding, so authors write `on-response(html:string)="#list.render({payload: html, swap: 'beforeend'})"`.
- [ ] `renderable` gains a `payload` slot taking a markup string, and `render` accepts it (payload inserts markup; it is not stamped with slots).
- [ ] `template` and `payload` are MUTUALLY EXCLUSIVE: supplying both is a definition-time signature error. There is no precedence rule.
- [ ] Migrate every `requestable` usage across `site/` that relied on requestable swapping — including default innerHTML-on-self, which has no `target`/`swap` attribute: `order-form.html`, `suggest-as-you-type.html`, `guarded-submit.html`, `network-quote.html`, `offline-fallback.html`, and `docs.html`. Move the swap into an `on-response` phrase and update embedded code blocks and prose to match.
- [ ] Update the four homes (docs.html, reference.html, README.md, index.html) for requestable losing `target`/`swap` and renderable gaining `payload`; the parity test in tests/site-smoke.test.ts stays green.
- [ ] Tests cover: requestable mutates no DOM and its `response` carries `html`; renderable renders a `payload`; supplying both `template` and `payload` is a definition-time error.

## Verification

On the committed tree, `pnpm run build` then `pnpm test` and `pnpm run check` all pass (node:test under tsx; strict tsc: no any, exactOptionalPropertyTypes, noUncheckedIndexedAccess). Concretely: requestable performs no DOM mutation and its `response` carries the payload; renderable renders a `payload` and rejects supplying both `template` and `payload` at definition time; every migrated example and doc page works; the four-homes parity test in tests/site-smoke.test.ts is green.

## Prohibited Patterns

- No cross-implementation call from requestable into renderable (no reaching for ensureImplementation); coupling goes through the grammar only.
- No precedence rule when both `template` and `payload` are supplied — it must be a definition-time error.
- No merge of requestable and renderable behind a `from` source keyword.
- No leaving `applySwap`, `target`, or `swap` in requestable.
- No code comments unless requested; new code must type-check under the strict tsconfig.
- No scratch work outside the repo (scratch/ allowed, delete before finishing).
