---
wait_human_start: false
wait_human_merge: false
dependencies: [expressions-inline]
---

# Task: the `pasted` event; delete `paste-transform`

## Metadata

- **Complexity:** Low
- **Priority:** Medium
- **Status:** Ready for Handoff

## Context

paste-transform.ts (41 lines, zero verbs) wires its own onPaste, reads the clipboard, applies a regex from config, preventDefaults, writes with setRangeText, then forges an input event (l.39) so other implementations notice — the hidden-listener-plus-synthetic-event pattern already removed from storable. Its regex is now a formula function (replace(), landed) and its "when" is the only thing left that deserves an implementation.

Why paste is a trigger of its own (ruling): intent, not timing. Rewriting on every keystroke is masking — formatting under the cursor; rewriting a pasted blob once is cleaning — welcome. Different intents, so paste earns its own event. The flicker argument for intercepting at paste was checked and is false: the paste and its synchronous input handler are one task; rendering happens between tasks; a rewrite in the handler lands before any paint. The only real cost of rewriting after the fact is one extra undo entry.

Why not native paste: at paste time this.value is the old value, and reinterpreting this.value to mean the clipboard is per-attribute sniffing. So the implementation fires a synthetic `pasted` after the insertion lands, when this.value is honestly the new value — the same relationship as beforeinput/input, in the project's own vocabulary. Native paste becomes unreachable through the DSL, the on-load precedent: one name, one meaning.

Implementation is a filter on input, not a paste listener at all: the input event that follows a native paste carries inputType "insertFromPaste". That is the moment the value is new. No clipboard read, no preventDefault, no forged event, no regex.

## Requirements

- [ ] New registry/behaviors/pastable/pastable.ts: defineImplementation("pastable", { tags: ["input", "textarea"], config: {}, verbs: {}, events: ["pasted"] }, …) with one method onInput(e): if e instanceof InputEvent && e.inputType.startsWith("insertFromPaste") (covers insertFromPasteAsQuotation), el.dispatchEvent(new ImplementationEvent("pasted")). Nothing else. Model: dirtyable.ts:16,47.
- [ ] Ordering is deterministic and pinned: attach() binds the author's on-* listeners before it wires implementation on* methods (attachment-engine requirement 1), so for one paste the sequence is on-input phrase → implementation onInput → pasted dispatched → on-pasted phrase. Test: both attributes on one element, each appends to a log; order is input, pasted. Document in one sentence: "on-pasted runs after on-input for the same paste; if both write the value, on-pasted wins."
- [ ] insertFromDrop and autofill do NOT fire pasted — pinned. Drop is out of scope by ruling (paste is about intent; drop is a different intent and gets its own event if ever asked for).
- [ ] Registered in rolldown.config.mjs implementations (replacing paste-transform), src/index.ts exports, implementation-registry if names are listed, the site's known-bundles set (tests/site-smoke.test.ts:31), and the auto-loader table if any remains post-attachment-remove-old.
- [ ] paste-transform/ deleted (both files). Archive note per project convention (archive/): "superseded by pastable + replace(); regex config moved to the expression, the event moved to on-pasted."
- [ ] pastable.test.ts: input with insertFromPaste fires pasted once; with insertText fires nothing; with insertFromDrop fires nothing; insertFromPasteAsQuotation fires; the ordering test; on-pasted="this.set(replace(this.value, '\D', ''))" on <input implements="pastable modifiable"> leaves digits only after a simulated paste; on-input masking and on-pasted cleaning coexist on one element and each fires for its own reason.
- [ ] README: implementations table row (pastable: no verbs, no config, event pasted, "fires after a paste has landed, so this.value is the new value"); the paste-transform row and prose (rg -c paste-transform README.md site/ = 9) deleted; one worked example under the expressions section: masking on on-input, cleaning on on-pasted, on the same input; the "Not supported" list gains "the native paste event — on-paste is not a trigger; on-pasted fires after the insertion". site/docs.html, site/examples.html mirror; the existing paste demo is rewritten to pastable + replace.
- [ ] pnpm check, pnpm build, pnpm build:site, pnpm test green; count not below baseline (paste-transform's tests are replaced, not dropped).

## Verification

pnpm check && pnpm build && pnpm test; rg -n "paste-transform|pasteTransform|clipboardData|insertFromPaste" registry/ src/ site/ README.md returns only pastable.ts and its test.

## Prohibited Patterns

- No paste listener, no clipboardData read, no preventDefault, no setRangeText, no forged input.
- No config on pastable; the transformation lives in the author's expression.
- No on-paste trigger reaching the native event; no on-before-input.
- No microtask or delay(0) to sequence pasted — the ordering falls out of attach()'s bind order.
- No code comments beyond the brief's.
