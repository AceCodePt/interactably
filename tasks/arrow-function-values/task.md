---
wait_human_start: false
wait_human_merge: false
dependencies: [implementation-presence-attributes]
---

# Task: Event data lives in arrow-function values

## Metadata

- **Complexity:** High
- **Priority:** High
- **Status:** Ready for Handoff

## Context

An `on-*` attribute name is now exactly `on-<event-type>`. Its value is one arrow function or a bracketed list of them, and all event data that used to live in the attribute name moves into the function's parameter. This is the second half of the new-forms migration and the largest mechanical change in the repository.

Before / after:
  on-keydown(key:`Enter`)="#f.send()"
  on-keydown="({key: 'Enter'}) => { #f.send() }"
  on-response(html:string)="#receipt.set(html)"
  on-response="({html: string}) => { #receipt.set(html) }"
  on-response="[
    ({status: 200, html: string}) => { #receipt.render({payload: html}) },
    ({status: 409}) => { #email-taken.show() }
  ]"

Settled decisions from the design discussion:
- Braced bodies only; concise bodies are a grammar error that shows the braced form.
- Single-quoted strings, numbers and true/false are literals and filter; any other tsyntax scalar binds. String comparison is exact/case-sensitive; numeric literals compare numerically.
- Only a handler's own type fields bind. No implicit key/code, no fallback to event values. Number/boolean bindings coerce from the raw value.
- `intersect` keeps margins as parameter fields: literals configure the element's single observer, types bind the resolved margin, all handlers on an element must agree on the margin set, and an undeclared slot is simply absent.

## Requirements

- [ ] `registry/interactable/parser.ts`: add `parseEventValue` and `parseEventValueWithErrors` returning handlers with spans. Grammar: `value := handler | '[' handler (',' handler)* ']'`; `handler := param '=>' '{' phrase-list '}'`; `param := '()' | '({ pfield (',' pfield)* })'`; `pfield := name ':' (literal | tsyntax-scalar)`. A single handler may omit the brackets; two or more require them; `[]` is legal and does nothing. A separating comma only follows a body's closing `}` at depth zero. Bodies must be braced; a concise body is a `ParseError` whose message shows the braced form. Body phrase spans and errors are value-relative so the language server's offsets stay exact.
- [ ] Remove `parseEventAttribute`, `EventAttribute` and `EventValueDeclaration`. Attribute names are only `on-<event-type>`; a name containing `(` is an error whose message names the new form.
- [ ] Literals are a single-quoted string, a number, or `true`/`false`. A single literal filters; a tsyntax scalar binds; literals and types mix in one parameter; `()` matches every firing. String equality is case-sensitive; numeric literals compare as numbers.
- [ ] `registry/interactable/executor.ts`: add `runEventValue` for attribute values (parse the handler list, match each parameter, run every matching handler's phrases in source order). Keep `runPhrases` for raw phrase lists. Bound values live in the walk state so delayed/debounced chains keep them. A name not bound by its own handler is an error; no implicit key/code and no fallback to `ev.values`.
- [ ] Wire-time validation in `attachment.ts`: unknown field on a closed event, duplicate field, malformed tsyntax, a literal incompatible with the event's declared field type, a declared type with no overlap with the event's declared type, and an unbound body name. Report the element and attribute and refuse to bind.
- [ ] `intersect.ts`: remove `isIntersectAttribute` and margin parsing from the attribute name. `on-intersect` handlers declare `state`/`full` and optionally `block-start`/`block-end`/`inline-start`/`inline-end`. Literal margins configure one observer per element; typed margins bind the resolved margin; handlers that disagree on the margin set are a wire-time error; omitted slots are absent and use the platform default. `state` and `full` are declared event fields.
- [ ] `events.ts`: declare the `intersect` field set; implementation event fields keep their declared types; `pastable.text`, `requestable.response.{html,status}`, `requestable.request-error.status`, `storable.save-error.reason` and `storable.restore-error.reason` filter through handler params.
- [ ] `storable.ts`: `readShapes` reads type fields from each `on-restore` handler parameter instead of the attribute name. `prevent-default.ts`: `derivedDefaults` reads `key`/`code` literals from `on-keydown` handler parameters.
- [ ] Expose `runEventValue` and the new parser types from `src/core.ts`; remove the removed parser exports and update every consumer.
- [ ] Migrate every `on-*` value in `registry/`, `tests/`, `site/` and `README.md` to the handler form. Merge same-event attributes into one attribute with a handler list (HTML forbids duplicate names): roving-focus, cities, suggest-as-you-type, live-preview, remembered-tab, synced-sections, scroll-spy and every docs section with two `on-intersect` attributes. Update site-smoke assertions that match old attribute names.
- [ ] Old `on-x(...)` attribute names log an error naming the new form and do not bind. No compatibility path.
- [ ] `pnpm build && pnpm check && pnpm test` pass on the committed tree.

## Verification

On the committed tree: `pnpm build && pnpm check && pnpm test` pass, including the site smoke tests. Every before/after example parses and runs. A single unbracketed handler and a one-element list behave identically. A concise body is a grammar error naming the braced form. An unknown parameter field and a contradictory field type are wire-time errors. Two handlers matching one firing both run. `rg -nE 'on-[a-z-]+\(' registry tests site README.md` matches only migration-error tests. `node scripts/build-site.mjs` succeeds.

## Prohibited Patterns

- Do not keep declaration parsing in attribute names or any compatibility path for `on-x(...)`.
- Do not accept concise bodies or non-braced handler bodies.
- Do not let bound names resolve outside their own handler, fall back to event values, or bind keyboard key/code implicitly.
- Do not use backticked literals; literals are single-quoted strings, numbers and true/false.
- Do not allow a handler comma anywhere except after a closing `}` at depth zero.
- Do not give `intersect` a second observer or a separate margin attribute.
- No `/tmp` scratch work; scratch lives in `<repo>/scratch/` and is deleted before finishing.
- No code comments unless requested.
