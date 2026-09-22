---
wait_human_start: false
wait_human_merge: false
dependencies: []
---

# Task: classable — add(), remove(), toggle() over classList

## Metadata

- **Complexity:** Low
- **Priority:** Medium
- **Status:** Ready for Handoff

## Context

`class` is a list, not a scalar, and the DOM already models it that way: `classList.add`, `.remove`, `.toggle`. `attributable` writes whole attributes — `setAttr('class', …)` replaces every class name on the element, which is the wrong tool for turning one of them on or off. That is not a gap in `attributable`; a list operation on `class` is a different job, so it gets its own implementation rather than a fourth verb on `attributable`. `classable` is three verbs that each take one class name and pass it to the matching `classList` method. It is tag-agnostic like `attributable`, has no config, no state, no events, and never reads or writes anything except `el.classList`. Two decisions are fixed and must not be reopened: (1) no second `force` argument on `toggle` — `add`/`remove` are the forced forms, and this matches the library shape (`revealable` dropped `show(boolean)` for distinct verbs); (2) native token behaviour, no whitespace handling — `add('open active')` reaches `classList.add` as one argument and the browser throws `InvalidCharacterError` (`SyntaxError` for `''`), reported through the executor's normal error path; splitting was rejected because `classList.toggle` accepts only one token, so split `add`/`remove` would disagree with it. Verb resolution is first-match in `implements` order (README `## Attachment`, "Receiver side"); `toggle` also exists on `revealable` and `remove`-prefixed names on `listable` — that is the documented rule, `classable` does not change it, and no collision check is added.

## Requirements

- [ ] registry/behaviors/classable/classable.ts: exactly `import { defineImplementation } from "@behaviors/_implementation-definition.ts";` followed by `export const classable = defineImplementation("classable", { verbs: { add: "string", remove: "string", toggle: "string" } }, (el) => ({ add: (_e, name) => el.classList.add(name), remove: (_e, name) => el.classList.remove(name), toggle: (_e, name) => el.classList.toggle(name) }));` and nothing else — no tags, config, state or events. Mirror `attributable.ts` exactly in shape.
- [ ] No trimming, splitting, lower-casing or validation of `name` beyond the signature's `"string"` check; whatever the string is goes to `classList` verbatim. `toggle` returns nothing meaningful to a phrase — do not surface `classList.toggle`'s boolean as a guard or a result; it is not a guard verb.
- [ ] Registration: `export { classable } from "@behaviors/classable/classable.ts";` in `src/index.ts` immediately after the `attributable` export (l.6, README-table order); `"classable"` in the `implementations` list in `rolldown.config.mjs` (alphabetical: between `"auto-grow"` and `"copyable"`); `import "@behaviors/classable/classable.ts";` in `site/demo.src.js` next to the `attributable` import (l.7); `"classable"` in `KNOWN_BUNDLES` in `tests/site-smoke.test.ts` (alphabetical: between `"auto-grow"` and `"copyable"`).
- [ ] registry/behaviors/classable/classable.test.ts (jsdom, same harness and `hostElement` pattern as `attributable.test.ts`): (1) `add('open')` on `<div implements="classable">` → `classList.contains('open')`; a second `add('open')` leaves `className === 'open'` (native no-duplication). (2) `add('open')` on an element already `class="a b"` → `className === 'a b open'`; other names untouched. (3) `remove('b')` on `class="a b c"` → `className === 'a c'`; `remove('zzz')` on the same → unchanged, nothing thrown, nothing logged. (4) `toggle('open')` twice → present after the first, absent after the second; pins that `toggle` takes no `force` and the second call is the inverse. (5) `add('open active')` → the interaction event carries an error whose `name` is `InvalidCharacterError`; `className` unchanged. Same for `toggle('open active')`. (6) `add('')` → error present (`SyntaxError`), `className` unchanged. (7) `add(42)` → signature error, `classList` unchanged — pins the `"string"` slot. (8) Executor path through `attach()`: `<button id="menu-btn" implements="classable" on-click="#menu.toggle('open')">` beside `<nav id="menu" implements="classable">`; dispatch `click` → `#menu` has `open`; again → does not. Then `on-click="#menu.add('open') && #menu.remove('closed')"` on `#menu` starting as `class="closed"` → one click yields `className === 'open'`. (9) Order rule: `implements="revealable classable"` and `implements="classable revealable"` on `<div>`s (use div, not dialog — jsdom lacks dialog `showModal`/`close`; revealable is tag-agnostic) — `toggle()` with no argument reaches `revealable` on the first and is a signature error (missing string) on the second; `toggle('x')` on the first is a signature error from `revealable` (its toggle declares `"undefined"`). Pins that first-match resolution governs, not the argument shape.
- [ ] Nothing in `tests/` beyond `KNOWN_BUNDLES`. `pnpm check`, `pnpm build`, `pnpm test` all green.
- [ ] README.md shipped-implementations table (`## The shipped implementations`, ~l.308): add `| `classable` | any | `add`, `remove`, `toggle` | — | `classList` writes, one class name per call; `toggle` has no force argument — `add`/`remove` are the forced forms |` directly after the `attributable` row (l.317), since the two are siblings.
- [ ] README.md: a two-sentence note directly under the table, before `### The pause mechanism`: `attributable` writes attributes whole; `class` is a token list, so `classable` exposes `classList` instead — `#menu.toggle('open')`, one name per call, browser rules for what a name may be. No `### Classable` subsection; it does not have enough to say for one.
- [ ] README.md `## API reference` implementations row (l.911): add `classable`.
- [ ] site/reference.html: a `ref-card` directly after `attributable`'s (l.93–101, before `logger` at l.103), same structure: tags `any element`, desc one sentence with the `#menu.toggle('open')` example and the "one name per call" note, Verbs `add` `remove` `toggle`, Config / state `—`.
- [ ] site/docs.html shipped-implementations table (l.470–492, `attributable` row at l.480): add a `classable` row directly after `attributable`'s — this file DOES carry the implementation list despite the earlier assumption; mirror it there too. (Its table already omits `focusable` — pre-existing, do not touch.)
- [ ] site/index.html l.202: change the spelled-out count **Sixteen → Seventeen** (focusable has already landed) and add a `classable` chip in the chip row directly after `attributable` (l.208).

## Verification

`pnpm check` (tsc --noEmit) and `pnpm build && pnpm test` both pass on the committed tree. `grep -rn classable registry/behaviors/classable/` shows only `classable.ts` and `classable.test.ts`; `grep -n classable src/index.ts site/demo.src.js tests/site-smoke.test.ts rolldown.config.mjs README.md site/reference.html site/docs.html site/index.html` finds the row/chip/entry in each file at the documented position; the shipped-implementations tables in README.md and site/docs.html both carry the `classable` row directly under `attributable`; site/index.html spells \"Seventeen\".

## Prohibited Patterns

- A `force` argument on `toggle`, a `replace(old, new)` verb, or a `has(name)` guard. Three verbs; if a page asks for `replace`, that is a new brief.
- Splitting, trimming or otherwise normalising the argument. Browser rules, browser errors.
- Any change to `attributable`. `setAttr('class', …)` keeps working and keeps meaning "replace the whole attribute".
- A verb-collision check in the registry. First-match in `implements` order is the rule for every implementation and stays so.
- `dataset` / `data-*` helpers, `style` property writes, or anything else that happens to be list-shaped on an element.
- Adding a `### Classable` subsection to README.md, or touching the docs.html table's pre-existing `focusable` omission.
