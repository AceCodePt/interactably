---
wait_human_start: false
wait_human_merge: false
dependencies: []
---

# Task: Source offsets in the phrase parser

## Metadata

- **Complexity:** Medium
- **Priority:** High
- **Status:** Ready for Handoff

## Context

This is the foundation for a future language server over Interactably markup. That server needs to underline the exact characters that are wrong inside an `on-*` attribute. Today it cannot, because `registry/interactable/parser.ts` discards every position it computes.

The parser is 483 lines built on `slice`, `indexOf` and `split` over the original string. Offsets exist at every step and are thrown away: `parse` maps `splitTopLevel(value, ";")` and immediately calls `.trim()` on each piece; `parsePhrase` slices around `findKeyColon`; `parseUnit` splits on `.` and trims each segment. Recovering a position later by searching for the text is not reliable, because the same substring can occur more than once in one attribute.

The only field currently named `position` is not a text offset. On `Modifier` it is the modifier's ordinal in the chain, used to check that `once()` is followed by a verb call; on the `expr` arm of `Arg` it is likewise an index into the phrase, not the source. Do not overload either. New fields get unambiguous names (`start` and `end`).

Errors are bare `throw new Error("missing receiver")` with no position at all. `parse` catches per phrase, prefixes the phrase text, pushes onto a local `errors` array, and after filling the cache logs each one with `console.error`. Phrases that failed are simply absent from the returned array. A language server cannot work with a console line: it needs the failures as data, with ranges.

### The position model, which matters

LSP does not use flat character offsets. A `Position` is a zero-based line plus a character, a `Range` is a start and an exclusive end, and `character` counts UTF-16 code units by default rather than characters or bytes. A proposal to make LSP offset-based was rejected.

None of that belongs in this parser. The seam is:

- The parser emits flat offsets relative to the attribute value it was given — integers, zero-based, `start` inclusive and `end` exclusive, in the coordinates of the string passed to `parse`. This is the natural output of a `slice`-based parser and stays true regardless of where the attribute sits in a document.
- The language server, later and elsewhere, does the conversion to line and UTF-16 character using the attribute's own document position. That code does not exist yet and is not part of this task.

Keeping the conversion out means the parser never learns about documents, encodings or line endings, and the runtime pays nothing for a tooling feature.

Expected gaps — predictions, not requirements; the handoff reports which materialised:

- Trimming is the main source of drift: an offset must point at the first non-whitespace character of a segment, not at the whitespace before it.
- Nested constructs — an object literal argument inside a verb call inside a unit — need a base offset threaded through more than one level.
- The `expr` arm already carries `source`; its new offsets must be relative to the same attribute value as everything else, not to the expression substring.
- Some errors are thrown from helpers that currently receive only a fragment and would need the base offset passed in.

## Requirements

- [ ] Thread a base offset through the splitting helpers so every construct can report where it began. `splitTopLevel` and `splitUnits` should return, or otherwise make available, the offset of each piece in the original string. Trimming must adjust the offset rather than lose it.
- [ ] Add `start` and `end` to the parsed structures: `Phrase`, `Unit`, `Call`, `Arg` and `Ref` at minimum, plus the phrase `key` when present. Offsets are relative to the string passed to `parse`, `start` inclusive, `end` exclusive. Name them `start` and `end`; do not reuse or redefine the existing ordinal `position` fields on `Modifier` and on the `expr` arm of `Arg`.
- [ ] Give every `throw new Error(...)` in the file a start and end describing the offending span, as narrowly as the parser can honestly say — the bad segment rather than the whole phrase wherever the information exists. When the offending segment is zero-length (for example the empty link between two dots in `a..b`), report the empty position with `start === end` rather than inventing a width. Introduce a dedicated error type carrying `message`, `start` and `end`; keep the existing message text unchanged so current output and tests are undisturbed.
- [ ] Expose failures as data. Add a parse entry point named `parseWithErrors` that returns both the phrases and a list of structured errors, so a caller can see what failed and where. The existing `parse` keeps its exact current behaviour — same signature, same return type, same `console.error` logging, same cache — and delegates to `parseWithErrors` so the cache is single-sourced. Nothing at runtime changes.
- [ ] The cache must stay correct. Whatever is cached must carry the offsets, and the cache key must not change meaning.
- [ ] Tests: for a representative phrase of each shape, assert that the reported `start` and `end` slice the original string back to exactly the expected text. That is the assertion that catches drift; a test that only checks a number is worth much less. Cover at least a keyed phrase, a multi-unit phrase with `&&`, a chained call, an object-literal argument, a `this` receiver, a read property and an `expr`. For errors, assert the span covers the offending segment for a missing receiver, an empty link between dots, a bad id and a malformed object field.

## Verification

- `pnpm run build` then `pnpm test` passes with no new failures. Run the build first; the suite fails against a stale `dist/`.
- `pnpm run check` passes.
- Slicing the source by every reported range reproduces the expected substring exactly, for every test phrase.
- The handoff reports which predicted gaps materialised, and states plainly whether any construct's offsets are approximate rather than exact.

## Prohibited Patterns

- No second parser for tooling. Offsets go into the existing one. A separate tooling parser would drift from the runtime and defeat the purpose.
- No line or column numbers, no UTF-16 conversion, no document coordinates. Flat offsets relative to the attribute value only, as described in Context.
- No LSP dependency, no `vscode-languageserver` package, no server. This task ends at the parser.
- Do not repurpose the existing `position` fields. They are ordinals.
- No change to runtime behaviour, error message text, dispatch or the public `parse` signature. This is additive.
- No recovering positions by searching for the text afterwards. The same substring can appear twice in one attribute; the offset must come from where the parser already knew it.
