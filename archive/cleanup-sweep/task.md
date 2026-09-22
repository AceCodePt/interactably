---
wait_human_start: false
wait_human_merge: false
dependencies: []
---

# Task: Cleanup sweep — delete `json-template`, one `describeElement`, one `logOnce`, the small-item sweep, and `pastable`

## Metadata

- **Complexity:** Medium
- **Priority:** Low
- **Status:** Ready for Handoff

## Context

Everything in this task was ruled 2026-09-17/21. Parts A–D add no construct; every item removes something, unifies two copies of the same thing, or turns a silent failure into a named one. Part E is the pastable task: it was moved to archive/pastable/task.md at 8bff51a without ever being run (paste-transform is still in the tree), so it is folded in here verbatim. Baseline at 8bff51a: pnpm build && pnpm test green. Do the parts in order — A first because it removes a site test that the rest would otherwise have to keep green. Parts A–E are independent of each other.

Approved clarifications from planning: (1) log.ts is a standalone module WeakMap with clearLogs called from clearPhraseState — behaviourally identical to stateOf(source).logged and avoids an executor→intersect→log→executor import cycle; intersect.ts's old copy was never cleared, so intersect warnings now re-arm on detach — the intended unification, worth a comment, not a regression. (2) D1 is mirrored in site/docs.html:300 too (same stale "Six properties" wording). (3) site/index.html: the "Sixteen ready-made capabilities" text at l.202 becomes "Fifteen" (16 on disk today, minus json-template and paste-transform, plus pastable) and the paste-transform chip becomes pastable; the json-template chip is removed. Note: attachment.ts:286–292 native-action warnings use literal `<form>`/`<a href>`/`<button>` rather than `<${el.localName}>`; drop the redundant literal tag in each since the unified describeElement now carries it (tests only assert the "also submits natively" substring).

## Requirements

- [ ] Part A — Delete json-template: rm -rf registry/behaviors/json-template/
- [ ] Part A — Remove the registration at rolldown.config.mjs:16 and the export at src/index.ts:16
- [ ] Part A — README: remove the Contents entry (l.47), the table row (l.325), the whole ### json-template section (l.389–402 through its trailing ---), and the name from the implementations list at l.891
- [ ] Part A — README Not supported (l.936): add one item — rendering data through a template (json-template was removed); listable.adopt(#tpl) stamps a template as written, and the triggers work from there
- [ ] Part A — Site: delete the example section at site/examples.html:743–790 (the <section class="example"> containing #team-data), the chip at site/index.html:218, the reference entry at site/reference.html:184 (whole <h3> block), the docs table row at site/docs.html:488, and the name from the list at site/docs.html:1041
- [ ] Part A — tests/site-smoke.test.ts: remove "json-template" from the module list at l.26 and the assertion block at l.292
- [ ] Part A — rg -n "json-template|jsonTemplate|data-array" --glob '!archive/**' --glob '!dist/**' --glob '!site-dist/**' returns nothing
- [ ] Part B — describe-element.ts takes the executor's body (tag, #id suffix, implements="…" suffix, wrapped in <…>; the defensive localName/tagName fallbacks stay). Delete executor.ts:334–344
- [ ] Part B — Every callsite renders the element with the shared function and nothing else: strip the hand-written </> at attributes.ts:52,74 and dispatch.ts:34; the messages at attachment.ts:207 and :286–292 drop their separate <tag>; rg -n "<\$\{describeElement" registry/ returns nothing
- [ ] Part B — New registry/interactable/log.ts exporting logOnce(el, message) — the executor's version, standalone module WeakMap, with a four-line comment: once per element per message; keyed on the exact message; cleared from clearPhraseState via an exported clearLogs; note that intersect warnings re-arm on detach by design. Delete both local copies; executor.ts and intersect.ts import it
- [ ] Part B — Existing tests that match on diagnostic text are updated to the unified shape (interactable-host.test.ts:333 skipped on <div#mismatch>, formattable.test.ts:64 skipped on <input>); no message loses information
- [ ] Part C1 — formattable.ts:22–26 second catch becomes logOnce(el, `formattable-format "${source}": ${err.message}`) then return raw; the first catch (attrs.format missing) stays. Test: formattable-format="{style: currency" (unclosed) logs once naming the attribute value, output unchanged, second write logs nothing
- [ ] Part C2 — requestable.ts:109 delete `|| method === "head"`; make the two union strings (l.12, l.22) identical in order
- [ ] Part C3 — parser: a key name longer than one character that contains + is a parse error (modifier keys are not supported; see Not supported); a bare + stays legal. Test: ctrl+k: this.set(1) is a parse error; +: this.set(1) parses and matches key: "+"
- [ ] Part C4 — keep registerImplementation's duplicate-name throw; add two lines to the README API section under registerImplementation saying exactly that (realistic cause: two copies of a behaviour in one page, cdn bundle plus a re-export; dev-server HMR without a page reload is not supported). No code change
- [ ] Part C5 — covered by Part B
- [ ] Part C6 — verify storable.ts:60 with a read; no change
- [ ] Part D1 — README l.184 rewrite: Five properties may be read off a ref — value, checked, min, max, step — and two more, height and width, inside expressions only; each with the type the element declares, no coercion. Keep the rest of the paragraph. Mirror the same fix in site/docs.html:300
- [ ] Part D2 — pin the unknown on-* behaviour with a test: attach <div on-intersect-half="#x.set(1)"> next to a working on-click, assert one console.warn naming the element and the attribute, assert the click still fires, and assert nothing threw. No code change unless the test fails
- [ ] Part E — New registry/behaviors/pastable/pastable.ts: defineImplementation("pastable", { tags: ["input", "textarea"], config: {}, verbs: {}, events: ["pasted"] }, …) with one method onInput(e): if e instanceof InputEvent && e.inputType.startsWith("insertFromPaste") (covers insertFromPasteAsQuotation), el.dispatchEvent(new ImplementationEvent("pasted")). Nothing else. Model: dirtyable.ts:16,43
- [ ] Part E — Ordering deterministic and pinned: attach() binds the author's on-* listeners before implementation on* methods, so for one paste the sequence is on-input phrase → implementation onInput → pasted dispatched → on-pasted phrase. Test: both attributes on one element, each appends to a log; order is input, pasted. Document in one sentence: on-pasted runs after on-input for the same paste; if both write the value, on-pasted wins
- [ ] Part E — insertFromDrop and autofill do NOT fire pasted — pinned
- [ ] Part E — Registered in rolldown.config.mjs (replacing paste-transform at l.21), src/index.ts (replacing l.14), site/demo.src.js (dropping paste-transform and json-template imports, adding pastable), and the site's known-bundles set (tests/site-smoke.test.ts:31, pastable replacing paste-transform)
- [ ] Part E — registry/behaviors/paste-transform/ deleted (both files)
- [ ] Part E — pastable.test.ts: insertFromPaste fires pasted once; insertText fires nothing; insertFromDrop fires nothing; insertFromPasteAsQuotation fires; the ordering test; on-pasted="this.set(replace(this.value, '\D', ''))" on <input implements="pastable modifiable"> leaves digits only after a simulated paste; on-input masking and on-pasted cleaning coexist on one element and each fires for its own reason
- [ ] Part E — README: implementations table row (pastable — input, textarea; no config; no verbs; event pasted; fires after a paste has landed, so this.value is the new value); the paste-transform row (l.323) and every other mention deleted (l.891 pasteTransform → pastable); one worked example under the expressions section — masking on on-input, cleaning on on-pasted, same input; Not supported gains the native paste event — on-paste is not a trigger; on-pasted fires after the insertion. site/docs.html and site/examples.html mirror (reference.html:173–181 card → pastable; docs.html:486 row, :1041 list, :1085 Not supported; examples.html ex-note demo rewritten to pastable + replace()); site/index.html:216 chip → pastable
- [ ] Part E — archive/pastable/task.md stays as history; add one line at its top: superseded — folded into cleanup-sweep Part E after being archived unrun
- [ ] Part A — site/index.html:202 "Sixteen ready-made capabilities" becomes "Fifteen" and the paste-transform chip at l.216 becomes pastable

## Verification

pnpm check && pnpm build && pnpm test all green; test count not below baseline (json-template's site assertion goes, paste-transform's tests are replaced, B/C1/C3/D2/E add). pnpm build:site builds the examples page without the team-data section. rg -n "json-template|jsonTemplate|data-array" --glob '!archive/**' --glob '!dist/**' --glob '!site-dist/**' returns nothing. rg -n "function describeElement|function logOnce" registry/ src/ returns exactly one hit each. rg -n '"head"' registry/behaviors/requestable/ returns nothing. rg -n "paste-transform|pasteTransform|clipboardData|insertFromPaste" registry/ src/ site/ README.md returns only pastable.ts and its test.

## Prohibited Patterns

- No replacement implementation for json-template; no {field} syntax anywhere; no "coming back later" note
- No new grammar, keyword, or readable property anywhere in this task
- No t.skip, no silent catch {} left where a diagnostic was requested
- No hand-built element descriptions in messages; describeElement is the only way an element is rendered in a diagnostic
- Part E: no paste listener, no clipboardData read, no preventDefault, no setRangeText, no forged input; no config on pastable; no on-paste reaching the native event; no on-before-input; no microtask or delay(0) to sequence pasted
- Do not touch wireControllers scanning or add a "size me now" verb — both are parked, not part of this task
