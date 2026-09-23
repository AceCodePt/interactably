---
wait_human_start: true
wait_human_merge: false
dependencies: []
---

# Task: events may declare values, bound by name at the trigger site

## Metadata

- **Complexity:** High
- **Priority:** High
- **Status:** Ready for Handoff

## Context

Implementation events today are pure signals. `requestable` fires `response` but the response body is unreachable from the grammar; `pastable` fires `pasted` but an author knows a paste happened and not what it was; `storable.restore` smuggles its value through `ImplementationEvent.key` and makes phrases filter on it (`on-restore="npm: …"`). That gap is the root of several separate problems: it is why `renderable` and `requestable` looked like they needed merging (both "put markup somewhere", only blocked by a response body that could not be named), and why `storable` grew DOM-writing behaviour it should never have had.

The addition: an event may declare the values it exposes, at the trigger site, in the attribute name, in a form that reads like TypeScript — `on-response(html:string)`, `on-pasted(text:string)`, `on-restore(value:string)`. The declared names become resolvable arguments inside that phrase and nowhere else.

Why the attribute name is legal (verified against the platform, not assumed): attribute names may not contain ASCII whitespace, NULL, `/`, `=` or `>`; parentheses, colons and commas are all permitted and the DOM preserves such names intact. Coloned and bracketed names trip HTML validators and require escaping in CSS selectors; neither affects runtime behaviour. Spaces are genuinely unavailable, which is why the form is written without them — `name:string,email:string`, never `name: string, email: string`.

The payload is the argument list, flat and never nested: no wrapper object, no `payload.` prefix. Splitting on commas and then on colons is sufficient; each right-hand side is an ordinary flat tsyntax string. A brace form (`on-response(payload:{name:string})`) would be the first place tsyntax describes structure rather than a single value and would require a recursive parser; do not add object types to tsyntax. Events carrying one value and events carrying several differ only in arity.

Values are strings. `requestable` returns text; a string payload drops straight into `render`'s existing slots, whose rest key is already `string | number | boolean`. No JSON parsing, no property chaining, no dotted slot names.

Parser work: `attachment.ts` slices the event type out of the attribute name (bindTrigger builds the listener type as `attribute.slice(3)` and validates it against the implementation's declared events). That slicing must learn the parenthesised form: split the name at the first `(`, take the type from the left, parse the declaration from the right. An attribute with no parentheses behaves exactly as today; the addition is purely additive and every existing page must keep working untouched. `ImplementationEvent` already carries a `key` field; the implementer decides whether declared values extend that shape or supersede it and says so in the implementation.

Checking: a name used in a phrase that the event does not declare is an error at definition time, raised when the element is wired (bindTrigger), not when the event fires — so an agent writing markup gets the error without exercising the page. A runtime throw that only surfaces on click is not acceptable.

Agreed decisions: declared names resolve as a standalone argument (`this.set(html)`) or an object-field value (`#list.render({body: html})`), but NOT inside formula expressions (`replace(html, …)` is out of scope — the formula has its own resolver and wiring names into it widens the blast radius of a grammar change that should stay additive). `storable.restore` is included additively only: it declares `value` and keeps dispatching `key`, so the `npm:` filtered pages keep working untouched; the breaking half (removing the filtering, removing the DOM write) belongs to a later storable-stops-mutating brief that depends on this one.

## Requirements

- [ ] `attachment.ts` and the parser learn the parenthesised attribute-name form `on-<type>(<name>:<flat-tsyntax>, …)`: split at the first `(`; the event type is the left side and the listener binds it; the declaration is the right side, parsed into name→tsyntax-string pairs by splitting on commas then colons. Every existing unparenthesised `on-*` attribute binds exactly as it does today, and every existing page works untouched.
- [ ] Declared names resolve as arguments inside the phrase on the declaring attribute and nowhere else: usable as a bare argument (`this.set(html)`) and as an object-field value (`#list.render({body: html})`); NOT inside formula expressions (`replace(html, …)` stays an error). A bare identifier that is not a declared name continues to fail as it does today.
- [ ] An undeclared name used in a phrase is a definition-time error raised when the element is wired (bindTrigger), never a runtime throw when the event fires. This wire-time parse/validation runs only for parenthesised attributes, so unparenthesised error timing is unchanged.
- [ ] `ImplementationEvent` carries the declared values. The shape decision — extend the existing `key` field or supersede it — is made and documented in the implementation; because `storable` still dispatches `key`, the values live alongside it (additive).
- [ ] `requestable.response` declares `html` carrying the response body text; `pastable.pasted` declares `text` carrying the post-paste value; `storable.restore` declares `value` additively, keeping its `key` dispatch so `on-restore="npm: …"` filtered pages work untouched.
- [ ] Each declared type string is validated as a flat tsyntax scalar at wire time (mirroring the signature system), so a malformed declaration errors when the element is wired.
- [ ] The site documents the parenthesised form across the homes: docs.html, reference.html, README.md and index.html — including the no-spaces constraint and the validator/CSS-selector caveat for coloned and bracketed attribute names — and the requestable/pastable/storable rows, cards, and descriptions mention the values their events declare.
- [ ] Tests cover: the parenthesised form in the parser; declared-name resolution as a bare argument and as an object-field value and nowhere else in the executor; the wire-time undeclared-name error in attachment; requestable/pastable/storable dispatching their declared values; and the four-homes parity test in tests/site-smoke.test.ts stays green.

## Verification

On the committed tree: `pnpm check` passes (tsc --noEmit, strict: no any, exactOptionalPropertyTypes, noUncheckedIndexedAccess). `pnpm build && pnpm test` passes, including: new parser unit tests for the parenthesised form (including that unparenthesised attributes parse identically to today); executor tests that a declared name resolves as a bare argument and as an object-field value and is an error inside a formula; attachment tests that an undeclared name is a wire-time error on the element being wired (and that unparenthesised attributes raise nothing at wire time); behavior tests that requestable dispatches `html`, pastable dispatches `text`, and storable dispatches `value` while still dispatching `key`; and the four-homes parity test green. Every existing page and example keeps working without edits.

## Prohibited Patterns

- No object types in tsyntax, no brace form (`on-response(payload:{…})`), and no nested declarations or recursive brace-depth parsing — the declaration is flat and split on commas then colons.
- No JSON responses, no property chaining on a reference, no dotted slot names.
- No general `event` argument form; a declared name is not a key into a wrapper object.
- No wiring declared names into the formula resolver — `replace(html, …)` and any other in-expression use of a declared name stays an error.
- No wire-time parse/validation for unparenthesised attributes; their error timing must be unchanged.
- No removing `storable`'s `key` dispatch or its DOM write in this task — that breaking half belongs to the later storable-stops-mutating brief.
- No runtime-only throw for an undeclared name; the definition-time wire error is the whole point.
- No /tmp scratch work; any scratch lives in <repo>/scratch/ and is deleted before finishing.
- No code comments unless requested.
