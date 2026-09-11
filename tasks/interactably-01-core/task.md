---
wait_human_start: false
wait_human_merge: false
dependencies: [interactably-00-conventions]
---

# Task: Interactably-01-Core

## Metadata

- **Complexity:** High
- **Priority:** High
- **Status:** Ready for Handoff

## Context

Clean-room implementation slice 1 of the Interactably design (README.md §3, §4, §8, Appendix A, decisions 11.21, 11.23, 11.30, 11.34). Build the pure, DOM-free core: the trigger grammar parser, signature compiler, interaction event, key vocabulary, legacy-event set, and the phrase executor. No custom elements, host mixin, registry, or implementations in this slice; those arrive in later slices that depend on this one. The README is the spec; follow its paths (registry/interactable/). Tests use node:test (and jsdom only if a test genuinely needs a DOM, which this pure slice should not). If a piece is too large you may create sub-tasks within README scope that depend on this task.

## Requirements

- [ ] registry/interactable/events.ts exports the closed LEGACY_EVENTS_WITHOUT_IDL set described in README §3.1.
- [ ] registry/interactable/keys.ts exports matchesKey(ev, name) implementing KeyboardEvent.key matching, case-insensitive, with 'space' meaning ' ' (README §3.3 rule 4, §5.5).
- [ ] registry/interactable/interaction-event.ts defines InteractionEvent extends Event with verb, arg, source, originalEvent, handled, error, result; non-bubbling and cancelable (README §4).
- [ ] registry/interactable/parser.ts implements the grammar in README §3.2, §3.3 and Appendix A: phrases split on ';', links on '.', mandatory parens on every verb, key prefix legal only on on-keydown/on-keyup and one per phrase, trailing whole-phrase modifiers debounce(ms)/throttle(ms)/once(), arguments as number, single-quoted string, true/false, #id, this, the three property reads (value/checked/valueAsNumber) and flat one-level object literals; refs stay unresolved tokens; parse results are cached by attribute string.
- [ ] Grammar errors are local and logged once (README §3.3 rule 13): a key under a non-keyboard attribute, a modifier before a verb, a second receiver, a second key, a second positional argument, or property access beyond the closed three skips only that phrase.
- [ ] registry/interactable/signature.ts exports compileSignature(sig): a tsyntax string slot validated via parseValueAgainstDSL, a constructor slot via instanceof, a record slot field-by-field, and 'undefined' meaning no argument; no coercion (README §5.3, §8.2, §11.23).
- [ ] registry/interactable/executor.ts exports runPhrases(source, value, ev): parse cached, key filter, throttle/debounce timers keyed by element + attribute + phrase index, late resolution of #id and this (this = source), dispatch an InteractionEvent at the receiver, and read the handled/error/defaultPrevented/result channels (README §8.1, §8.2).
- [ ] Chain semantics match README §3.3 rules 6, 7, 8: '.' links run in order and abort on preventDefault(), on error, or on an unowned verb; ';' phrases are independent; once() is consumed only when the whole chain completes; references resolve at fire time.
- [ ] Errors are reported through console.error/console.warn and never thrown from the event path (README §5.1 Reporting, §11.33).
- [ ] Unit tests under registry/interactable/ cover every grammar rule in §3.3, every modifier and argument kind, the three return channels, chain abort/independence, late binding, and the parse cache.

## Verification

`pnpm check && pnpm test` pass; registry/interactable/parser.test.ts, signature.test.ts and executor.test.ts exist and cover README §3.3 rules 1-15 and the §8.1 pipeline.

## Prohibited Patterns

- Never create or write files under /tmp or any system temp directory; do scratch work in <repo>/scratch/ and delete it before finishing.
- Do not add runtime dependencies beyond auto-wc and tsyntax.
- Do not implement the host mixin, registry, auto-loader, or any implementation in this slice.
- Do not carry over any Command Protocol code from behavior-fn; this is a clean-room implementation.
