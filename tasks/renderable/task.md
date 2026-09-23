---
wait_human_start: false
wait_human_merge: false
dependencies: [requestable-errors]
---

# Task: renderable — client-side template rendering

## Metadata

- **Complexity:** High
- **Priority:** High
- **Status:** Ready for Handoff

## Context

Nothing in the library writes content. attributable writes attributes, classable writes classes, formattable/modifiable write .value, requestable swaps server markup. The one exception was listable.adopt, a rendering primitive in embryo in an implementation that should not own it.

The forcing requirements are the offline fallback (press a button, try the network, render from a local template when there is no network) and its sibling optimistic UI (render first, request second). Both need one implementation that owns DOM insertion/swapping: renderable.

The brief deletes listable ENTIRELY (adopt, min-rows, removeRow, clear all go; the implementation is removed, sixteen remain). removeRow only ever solved "I do not know which row I am in" via a closest-style walk-up the grammar deliberately has nowhere else; once a rendered row carries an author-supplied id, the delete button targets it directly.

Design decisions agreed with the human:
- The receiver is the destination container; the template is an argument: #list.render({template: #row-tpl, swap: "beforeend", title: this.value, id: now()}).
- Swap vocabulary mirrors requestable exactly (innerHTML, outerHTML, beforebegin, afterbegin, beforeend, afterend, delete, none) plus a target selector; the two vocabularies must be shared so they cannot drift. Swap is a field on the argument object, not a verb (replace-as-verb would collide with the existing string verb).
- Slots are curly-bracket names, flat scalars only, substituted into text nodes AND attribute values (the delete pattern needs attributes). Loud failure: an undeclared slot name supplied, or a declared slot with no value, throws. Nested objects/arrays are out of scope.
- Template is a ref (#row-tpl) whose slot is HTMLTemplateElement; the field is OPTIONAL via a new optional-Ctor rule in the signature system (missing key passes; present → instance-checked). renderable enforces at runtime that template is required for every swap except delete/none.
- Deletion pattern (no walk-up): the template authors <li id="row-{id}">…<button on-click="#list.render({swap: 'delete', target: '#row-{id}'})">×</button></li>; the clone is stamped before it attaches, so the parser reads #row-1758… as an ordinary ref. renderable stays on the container only, same shape as requestable's target.
- Ids are author-supplied, never generated; a duplicate id throws BEFORE inserting (two elements sharing an id means every later ref resolves to the first).
- Rollback is an explicit undo verb, one slot (not a stack): it reverses the one operation the phrase created. Append/prepend hold node references and remove them; a swap holds displaced markup and restores it. Interleaved failures are not supported and the docs say so.
- Optimistic UI needs no new event: the grammar already sequences on-click="#list.render(...); #form.send()". Online and offline are separate paths that never meet; nothing is injected into a template from a response.
- The offline example keys on requestable's request-error event via the "offline:" channel, which arrives from the requestable-errors task; that task lands first (dependency).

The "*" rest-key signature design is reused from the killed listable-stamp task (a "*" key in a record signature whose slot validates every undeclared key), NOT reinvented.

## Requirements

- [ ] New registry/behaviors/renderable/ registers an implementation named `renderable` on any element, with exactly two verbs: `render` (object argument) and `undo` (no argument).
- [ ] Signature system extended with the "*" rest key: in a record signature, a "*" field's slot validates every undeclared key, and declared keys still validate against their own slots. Scalar slot for render's rest is "string | number | boolean" (flat values only). Wired through registry/interactable/signature.ts, registry/behaviors/types.ts (ArgOf/ValidatedSig/index-signature mapping), and registry/behaviors/_implementation-definition.ts; signature.test.ts and _implementation-definition.test.ts cover it.
- [ ] Signature system extended so a Ctor field declared as `HTMLTemplateElement | undefined` is optional (missing key passes signature validation; present value is instance-checked); the render signature declares template, swap, target plus "*", with swap mirroring requestable's union exactly.
- [ ] The swap vocabulary (the mode union) and target resolution are shared between requestable and renderable so the two vocabularies cannot drift; renderable applies node/fragment content where requestable applies response HTML.
- [ ] render resolves the template selector/ref, throws loudly when it is not an HTMLTemplateElement, clones its content, and substitutes every {name} occurrence in text nodes and attribute values across the clone, stringifying scalar values.
- [ ] Loud failure, before any insertion: a supplied slot value whose name is not declared in the template throws; a declared slot with no supplied value throws; a duplicate id (any id in the clone already present in the document) throws and nothing is inserted.
- [ ] render supports swap modes innerHTML, outerHTML, beforebegin, afterbegin, beforeend, afterend, delete, none, with an optional target selector defaulting to the receiver; template is required for every mode except delete and none (runtime-enforced), and multi-child fragments preserve DOM order for beforeend/afterbegin/beforebegin/afterend.
- [ ] undo reverses the one last render per receiver: beforeend/afterbegin/beforebegin/afterend remove the inserted nodes; innerHTML/outerHTML/delete restore the displaced markup; none records nothing; undo with nothing recorded is a no-op; a later render overwrites the single undo slot.
- [ ] registry/behaviors/listable/ is deleted entirely (listable.ts and listable.test.ts), and every trace is gone: src/index.ts export, rolldown.config.mjs implementations array, site/demo.src.js import, and tests/site-smoke.test.ts KNOWN_BUNDLES (listable out, renderable in).
- [ ] price-calculator and dynamic-list examples are converted to renderable: rows stamped via render with an author-supplied id slot, the row template authors <li id="row-{id}"> with a × button calling render({swap: 'delete', target: '#row-{id}'}), and the site-smoke test's listable block is rewritten to drive render/delete/undo.
- [ ] A new site/examples/offline-fallback.html example demonstrates the optimistic/offline flow (on-click="#list.render({…}); #form.send()" plus on-request-error="offline: #list.undo()" keyed on the requestable-errors channel), is listed in EXAMPLE_PAGES and examples.html, and is exercised in site-smoke.
- [ ] Site parity across all four homes and the API rows: docs.html (implementation table row, signatures code block, API Implementations row), reference.html card, index.html chip and inline demo, README.md table row and API row, examples.html blurb/tags — renderable in, listable out; the README Not-supported line about template rendering is rewritten to reflect that renderable now renders through templates; the docs Dynamic-triggers row is rewritten to the id-targeting model.
- [ ] registry/behaviors/price-calculator.test.ts is updated to renderable (no min-rows floor; × deletes the targeted row).

## Verification

`pnpm check` passes (tsc --noEmit, strict: no any, exactOptionalPropertyTypes, noUncheckedIndexedAccess). `pnpm build && pnpm test` passes on the committed tree, including: the new renderable unit tests (each swap mode, slot fill into text and attributes, undo for beforeend/afterbegin/beforebegin/afterend/innerHTML/outerHTML/delete, duplicate id throws before insertion, unknown slot throws, missing value throws), the rewritten price-calculator and dynamic-list site-smoke flows, the offline-fallback flow (render inserts, send fires, a failing response fires request-error and undo restores), and the four-homes parity test (docs.html row, reference.html card, index.html chip, README row, both API Implementations rows) with renderable present and listable absent.

## Prohibited Patterns

- No implicit or network-coupled rollback: undo only ever runs as the explicit verb, and renderable never reaches into requestable (and vice versa).
- No multi-entry undo stack or ordering rules; the single undo slot is the whole history.
- No id generation inside renderable; ids come only from the caller.
- No nested objects or arrays as slot values; flat scalars only.
- No "…" or any rest marker other than "*" in record signatures.
- No closest/walk-up row resolution anywhere; the removeRow pattern is not reintroduced in any implementation.
- No leaving any listable reference in source, build config, bundles, tests, README, or the four site homes.
- No before-request event or other new event for optimistic UI; the grammar's ; sequencing is the mechanism.
- No /tmp scratch work; any scratch lives in <repo>/scratch/ and is deleted before finishing.
