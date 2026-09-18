---
wait_human_start: false
wait_human_merge: false
dependencies: [attachment-onload]
---

# Task: storable (declared slot, storable-value only) + dirtyable amendments

## Metadata

- **Complexity:** High
- **Priority:** High
- **Status:** Ready for Handoff

## Context

Slice 6 of drop-customized-builtins (brief order 6, rulings D1/D3). storable becomes a declared slot under storable-value-only match semantics; dirtyable loses markClean and uses the per-element attribute observer as the baseline's event. Includes the site demo markup that uses these implementations and the site-smoke behavior assertions - but NOT the reader-facing prose (docs slice). on-load exists from attachment-onload. Baseline green at main.

## Requirements

- [ ] storable.ts: config { scope: "'local' | 'session' | undefined", key: "string", value: "string" } - key and value required (dropping the | undefined makes bindAttributes throw a signature error at attach naming the attribute); verbs save, restore, clear (the load verb is renamed restore - it would collide with on-load in every reader's head); delete the attrs.key || name || el.id fallback and its warning, resolvedValue()'s .value fallback and its warning, the whole checkable same-name JSON-array branch, the connectedCallback restore, the DOMContentLoaded deferral, pendingReady and disconnectedCallback.
- [ ] restore semantics: save() writes the slot under the key; restore() reads the key and fires the restore event only when the stored value was applied or matched, at most once per restore() call, never from save(); an authored storable-value matches rather than writes (fires restore only when it equals the stored value; a different stored value changes nothing); restore() with no stored value fires nothing; clear() unchanged. Nothing is restored without on-load="this.restore()" written by the author. The write direction is out of scope: the storage-driven <img storable-key="avatar"> example is documented as on-restore on a matching element doing #avatar.setAttr({name:'src', ...}) with a literal.
- [ ] dirtyable.ts: markClean is deleted (the verb and its commit() body). The baseline is the platform default; the author moves it with this.setAttr({name:'value', value:this.value}) - the parser already accepts a property read as an object-literal field (verified, no parser change); after a restore that should count as pristine: on-restore="this.setAttr({name:'value', value:this.value})". dirtyable subscribes to the per-element attribute observer for value and checked (an attributeChangedCallback) so when the default moves, dirty is re-evaluated immediately and dirty/clean fire on transition; the "state re-evaluates on the next input against the new default" test becomes "re-evaluates when the attribute changes". One sentence (in the docs slice) notes that on <textarea>/<select> setAttr cannot move the baseline; no mechanism in this PR.
- [ ] storable.test.ts rewrite: drop every checkable-group test and every name/id-fallback test; add: missing storable-key is a signature error at attach naming the attribute; missing storable-value likewise; nothing is restored without on-load="this.restore()"; on-load="this.restore()" on an element in the initial scan restores after DOMContentLoaded; the same on an inserted clone restores once; restore() with no stored value fires nothing; save() never fires restore. Test count must not go down.
- [ ] dirtyable.test.ts: the markClean tests are replaced by the setAttr-baseline + attribute-observer re-evaluation path (including on-restore="this.setAttr({name:'value', value:this.value})" counting as pristine).
- [ ] Site demo markup + site-smoke: the package-manager buttons gain on-load="this.restore()"; the note/note-clean demo and the price-calculator Reset/Escape lose markClean (escape: this.reset(); #preview.compute()); anything using the removed name/id fallback or the load() verb is updated; tests/site-smoke.test.ts's markClean/data-dirty/restore assertions are updated to the new semantics and still pass.
- [ ] pnpm check, pnpm build and pnpm test all pass.

## Verification

pnpm check && pnpm build && pnpm test pass; the storable suite covers the required key/value errors and the on-load restore cases; rg -n 'markClean|storable-target' registry/ site/ returns nothing (docs excluded); test count not below the previous baseline.

## Prohibited Patterns

- No storable-target and no write-direction storable (D1).
- No connectedCallback restore; save() must never fire the restore event.
- Do not touch README/docs.html/reference.html prose (docs slice owns the paragraphs); only the site demo MARKUP and smoke assertions change here.
- No code comments beyond the brief's.
