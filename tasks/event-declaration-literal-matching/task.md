---
wait_human_start: false
wait_human_merge: false
dependencies: []
---

# Task: Event declarations may match literals, not only bind types

## Metadata

- **Complexity:** High
- **Priority:** High
- **Status:** Ready for Handoff

## Context

event-value-binding shipped the first half of the mechanism: an event declaration in an attribute name binds values by name and type, e.g. on-response(name:string,email:string)="#greeting.render({template: #tpl, name: name})". parseEventAttribute in registry/interactable/parser.ts:196 splits on commas, then on the first colon, and treats everything after the colon as a type. There is no way to say "only fire when this value is X". This task adds that half. Two briefs are blocked on it: requestable-error-split and intersect-named-slots.

A declaration's right-hand side becomes a discriminated union: a type name binds, a backticked literal matches. on-keydown(code:`Escape`)="#dialog.close()" and on-request-error(status:`404`)="#msg.render({template: #not-found})". Backticks because the alternatives fail: quotes are illegal in attribute names (forbidden set is ASCII whitespace, NULL, U+0022, U+0027, >, / and =) and a quote would be nested inside the quoted attribute value; backticks are legal in attribute names and need escaping only in unquoted attribute values. Entities are not substituted in attribute names, so there is no escape mechanism there at all.

Literals are explicit, never implied: an unbackticked word is always a type name. The rejected alternative was treating string/number/boolean as reserved words and everything else as a literal — an invisible rule that would silently change meaning the day a field's type gained a name someone had already used as a literal.

Literals are interpreted against the field's declared type: status:`404` matches the number 404 because status is declared number on the event; the spelling is source text, the comparison is typed. Numbers bind but cannot be matched, except where the event declares a small closed set of numeric values. General numeric equality is meaningless for floats and ranges are impossible (> and < are illegal in attribute names, and word operators like gt-0.5 were rejected as a second grammar); range-shaped configuration stays in config attributes. All matching declarations fire — there is no most-specific-match rule (specificity is undefined for genuinely overlapping patterns; first-match-wins would silently drop one), matching how ; phrases already behave. No mixed form: a declaration either matches literals or binds types.

Fields are allowlisted per event: an event exposes a small named set of fields, not its whole platform interface (keydown offers key and code, not the other twenty-odd KeyboardEvent properties). The allowlist is deliberate — it is the documentation, keeps the surface reviewable, and makes adding a field a decision rather than an accident; the churn cost of a new field needing a change here is accepted.

Closed field sets are defined by the library or the platform and a declaration against them is checked at definition time (unknown field name or wrong-typed literal is an error the author sees immediately). Everything is closed except two. Open field sets are those whose values arrive as opaque strings from outside the document: response and restore; the trigger-site declaration is the type and can only be verified when the value arrives. dirty, clean and the keyboard events are closed.

Decisions made with the human: (1) request-error is left untouched in this task — it partitions via ImplementationEvent.key today (registry/behaviors/requestable/requestable.ts:61), so the numeric-literal rule is exercised with a test-local implementation and the request-error status field belongs to requestable-error-split. (2) defineImplementation's events grows from readonly string[] into a per-event map carrying the field schema and an open flag, with a small built-in table for the platform keyboard events keydown/keyup. (3) This stays one task.

Parser mechanics: in parseEventAttribute, after splitting on commas and on the first colon, inspect the right-hand side — if it opens and closes with a backtick it is a literal, otherwise a type name; reject an unterminated backtick, an empty literal, and a literal containing a backtick. The resulting declaration carries a discriminant so the dispatch path can filter before invoking the phrase. Matching happens before the phrase runs, not inside it. Note the attribute is parsed twice today (wire time in bindTrigger and fire time in runPhrases), so the discriminant must survive both parses.

Documentation: the docs must state the key versus code trade honestly rather than recommending one. code is the physical key, unchanged by layout, locale or modifiers; key is the character produced. Use code for positional things and key when the character is what matters. Both break somewhere: code:`KeyA` hits the key labelled Q on AZERTY; key breaks on layouts that produce different characters entirely, such as Russian. Keyboard.getLayoutMap() is the usual workaround and is deliberately not used here: it is Chromium-only and does not cover keys absent from a layout. Modifier and navigation keys — Escape, Enter, Tab, arrows — are the safe common case, where code and key agree across layouts; most real usage is there.

Explicitly not in scope: alias tables for unwriteable characters; quoted literals of any kind; a most-specific-match rule; word operators or any range syntax; exposing native events wholesale (the allowlist grows on demand); minimum and maximum bounds in signature types.

## Requirements

- [ ] parseEventAttribute treats a right-hand side that opens and closes with a backtick as a literal, otherwise a type name. It rejects an unterminated backtick, an empty literal, and a literal containing a backtick. EventValueDeclaration becomes a discriminated union carrying the discriminant (e.g. kind: "type" | "literal"), and the discriminant survives both parses (wire-time bindTrigger and fire-time runPhrases).
- [ ] The dispatch path filters on the discriminant before the phrase runs, not inside it: a literal declaration fires the phrase only when the field's typed value equals the literal; a type declaration binds as today.
- [ ] Literals are interpreted against the field's declared type: status:`404` matches the number 404 when status is declared number; the literal spelling is source text and the comparison is typed. A literal whose type does not match the field's declared type is a definition-time error for a closed field set.
- [ ] Numbers bind but cannot be matched, except where the event declares a small closed set of numeric values. No range syntax exists (no >/< in attribute names, no word operators); range-shaped configuration stays in config attributes.
- [ ] All matching declarations fire: two declarations on the same element that both match an event both run, with a test proving it. There is no most-specific-match and no first-match-wins rule.
- [ ] A declaration either matches literals or binds types; no mixed form (no declaration that matches one field while binding another).
- [ ] An event exposes an allowlisted set of fields, not its whole platform interface. Closed sets are validated at definition/wire time (unknown field name or wrong-typed literal is an error the author sees immediately); open sets are not. Enumerate and confirm the split against the current implementation set before coding: keyboard keydown/keyup closed exposing key and code (both string); dirty/clean closed with no fields; pasted closed (text:string); response and restore open; intersect events and request-error unchanged in this task.
- [ ] defineImplementation's events grows from readonly string[] into a per-event map carrying each event's field schema and an open flag, with a small built-in table for the platform keyboard events keydown/keyup. response and restore are marked open; all other events are closed. Existing unparenthesised on-* attributes and existing pages keep working untouched.
- [ ] The numeric-literal rule is exercised with a test-local implementation (a closed event with a small numeric enum field), not by changing requestable. request-error keeps partitioning via ImplementationEvent.key.
- [ ] site/docs.html documents the key versus code trade honestly with no recommendation: code is the physical key unchanged by layout/locale/modifiers, key is the character produced; use code for positional things and key when the character matters; both break somewhere (code:`KeyA` hits Q on AZERTY; key breaks on layouts like Russian); Keyboard.getLayoutMap() is deliberately not used (Chromium-only, misses keys absent from a layout); modifier/navigation keys are the safe common case where both agree.
- [ ] If the event or field surface described in the four homes changes, the docs.html table, reference.html card, README.md row and index.html chip are updated together and tests/site-smoke.test.ts stays green.
- [ ] Tests cover: parser literal-vs-binding and malformed literals (unterminated, empty, backtick-containing); typed comparison against the declared type; overlapping literal declarations both firing; definition-time rejection of an unknown field and a wrong-typed literal for a closed set and acceptance for response/restore; and that unparenthesised and type-binding attributes behave exactly as today.

## Verification

On the committed tree: pnpm run build then pnpm test and pnpm run check all pass. Concretely: parser.test.ts covers a backticked right-hand side parsing as a literal and an unbackticked one as a type, and rejects unterminated/empty/backtick-containing literals; a dispatch test shows on-keydown(code:`Escape`) running only when KeyboardEvent.code === "Escape" and an unbackticked declaration binding as before; a test shows two overlapping literal declarations both fire; a wire-time test shows an unknown field and a wrong-typed literal log an error for a closed event and are accepted for response/restore; a test-local implementation with a small numeric enum field shows a numeric literal matching; every existing page and example keeps working without edits; tests/site-smoke.test.ts four-homes parity stays green and the docs body loads without console.warn/error.

## Prohibited Patterns

- No alias table mapping literal names to unwriteable characters; a hidden mapping is the problem, not the fix.
- No quoted literals of any kind; literals are backticked only.
- No most-specific-match rule and no first-match-wins; all matching declarations fire.
- No word operators or any range syntax; no min/max bounds in signature types.
- No exposing native events wholesale; the allowlist grows on demand only.
- Do not treat string/number/boolean as reserved words with everything else a literal — an unbackticked word is always a type name.
- No mixed bind-and-match declaration.
- Do not add a status field to request-error or otherwise change requestable; that belongs to requestable-error-split.
- No /tmp scratch work; any scratch lives in <repo>/scratch/ and is deleted before finishing.
- No code comments unless requested.
