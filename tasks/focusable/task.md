---
wait_human_start: false
wait_human_merge: false
dependencies: [cleanup-sweep]
---

# Task: `focusable` — `focus()` and `blur()` as verbs

## Metadata

- **Complexity:** Low
- **Priority:** Medium
- **Status:** Ready for Handoff

## Context

A combobox with a server-rendered options list needs roving focus: ArrowDown on the input moves real DOM focus to the first option, ArrowDown on an option moves it to the next, ArrowUp on the first returns to the input. Native `<datalist>` is unstylable, so the list is a `<ul>` of `<li><button>`s that `requestable` re-fills on every keystroke. The pattern is MDN's "common convention" for combobox popups (focus moves to the first focusable descendant); the alternative, virtual focus via `aria-activedescendant`, is not used and must not be set.

Every phrase in this library names its receiver by id. Nothing walks siblings, guesses which descendant is focusable, or keeps a cursor. A `cycleable` implementation that did those things was designed and rejected as too explicit for what it returned — it needed a target selector, a wrap flag, `tabindex` on every child and phrases on two elements to reproduce what the platform already does when told exactly where to go. It is dead; do not resurrect any part of it.

The adopted shape puts the walk in the markup, where the server that generates the options can state it: each option carries an id, `implements="focusable"`, and a phrase pointing at its neighbour. The library contributes one verb that calls `HTMLElement.focus()` and one that calls `blur()`. Wrap-around is whatever the last option's phrase points at — an authoring choice visible in the page, not a mode.

There are no host-level verbs and this task does not introduce any: a receiver answers only the verbs its `implements` declares, so every option lists `focusable`. That is constant text; the id is the only thing that varies per option, which is the property the author asked for. `click()`, `remove()` and `scrollIntoView()` were considered as companions and deliberately left out — `focus`/`blur` are the pair a real page asked for, and nothing else has.

## Requirements

- [ ] `registry/behaviors/focusable/focusable.ts`: `defineImplementation("focusable", { verbs: { focus: "undefined", blur: "undefined" } }, (el) => ({ focus, blur }))`. No `tags` (tag-agnostic, like `attributable`). No `config`, `state` or `events`.
- [ ] `focus`: call `el.focus()`. If afterwards `document.activeElement !== el` and `el.isConnected`, report once per element through `logOnce` (`registry/interactable/log.ts`; it writes `console.error`, keyed on the exact message): `focusable: focus() on ${describeElement(el)} did not take — the element is not focusable; add tabindex="-1" or put focusable on the control inside it`. A silent `focus()` on an unfocusable `<li>` is the failure that hides; the report is the whole reason the check exists.
- [ ] `blur`: call `el.blur()`. No check, no report — blurring an element that does not have focus is a native no-op and stays one.
- [ ] Neither verb sets `tabindex`, `role`, `aria-*` or any attribute. Neither reads `defaultPrevented`, stops propagation, or dispatches an event. Neither touches `document.activeElement` except to read it for the warning.
- [ ] Registration: `export { focusable } from "@behaviors/focusable/focusable.ts";` in `src/index.ts`; `"focusable"` in the bundle list in `rolldown.config.mjs`; `import "@behaviors/focusable/focusable.ts";` in `site/demo.src.js`; `"focusable"` in `KNOWN_BUNDLES` in `tests/site-smoke.test.ts`. Match the ordering convention each file uses — append in `src/index.ts` and `site/demo.src.js`, alphabetical in `rolldown.config.mjs` and `KNOWN_BUNDLES` (between `dirtyable` and `formattable`).
- [ ] `registry/behaviors/focusable/focusable.test.ts` (jsdom, via `test-harness.ts` like the other implementation tests): 1) `focus()` on a `<button id="b" implements="focusable">` → `document.activeElement === b`. 2) `focus()` on `<li id="i" tabindex="-1" implements="focusable">` → `activeElement === i`. 3) `focus()` on `<li id="i" implements="focusable">` (no tabindex): `activeElement` unchanged, exactly one `console.error` whose message contains `did not take`; a second `focus()` on the same element logs zero more times; `focus()` on a *different* unfocusable element logs once more. 4) `blur()` on the focused element → `activeElement === document.body`; `blur()` on an unfocused element → no change, nothing logged. 5) Executor path — the combobox fixture below, through `attach()`: dispatch `keydown` `{key: "ArrowDown"}` on `#search` → `activeElement` is `#results-1`; again on `#results-1` → `#results-2`; on the last option → back to `#results-1` (the wrap the markup states); `keydown` `{key: "ArrowUp"}` on `#results-1` → `activeElement === #search`; `{key: "ArrowLeft"}` on `#search` → unchanged (keyed phrases do not fire on other keys — pins that the key gate, not the verb, is doing the work). 6) The fixture's `<ul>` is replaced wholesale (simulating a `requestable` swap) with a new list whose first option is again `#results-1`: after one microtask, ArrowDown on `#search` focuses the *new* `#results-1`. Pins that positional ids survive a re-fill because attach is per insertion.
- [ ] Nothing in `tests/` beyond `KNOWN_BUNDLES`; `pnpm check`, `pnpm build`, `pnpm test` all green.
- [ ] `README.md` shipped-implementations table (`## The shipped implementations`, ~l.306): add the row `| `focusable` | any | `focus`, `blur` | — | `HTMLElement.focus()` / `blur()` as verbs; reports once if focus did not take |` as the last row, after `copyable`.
- [ ] `README.md`: a `### Focusable` subsection after `### Storable`, and a matching entry in `## Contents`. Content, in this order: one sentence (two verbs, what they call, that focus reports once when it did not take); the combobox worked example (below), with the comment that ids are positional and regenerated with each response, so the input's `#results-1` is always the current first option; three explicit statements (`aria-activedescendant` is not set and must not be — real focus is on the option, the screen reader announces it; the library never walks siblings or picks a "first focusable" — every hop is a phrase the server wrote; wrap-around is what the last option's phrase points at, not a setting); the `prevent-default` note (every keyed `on-keydown` here carries `implements="prevent-default"` so the derived `keydown:arrowdown` / `keydown:arrowup` cancel page scroll and caret movement — cross-reference [§ prevent-default and no-propagate](#prevent-default)); one sentence on `blur()` (legal on any receiver, nothing logged, a native no-op when the element is not focused).
- [ ] `README.md` `## API reference` implementations row (~l.889): add `focusable` (append).
- [ ] `site/reference.html`: a `ref-card` after `copyable`'s, same structure: tags `any`, desc one sentence with the input-phrase example, Verbs `focus` `blur`, Config / state `—`, Events `—`.
- [ ] `site/index.html` (~l.202): change the count **Fifteen** to **Sixteen** and add a `focusable` chip in the chip row (after `copyable`).
- [ ] `site/docs.html`: `grep -n copyable site/docs.html` — it does carry an `Implementations` table row (~l.1066) listing every implementation; add `focusable` to that row.

## The worked example (goes in the README verbatim, adjust ids only if the section needs it)

```html
<input id="search" type="search" role="combobox" aria-controls="results" aria-expanded="true"
       implements="requestable focusable prevent-default"
       requestable-url="/api/options" requestable-target="#results"
       on-input="this.debounce(150).send()"
       on-keydown="arrowdown: #results-1.focus()">

<ul id="results" role="listbox">
  <!-- server-rendered; ids are positional and regenerated with every response -->
  <li role="option"><button id="results-1" implements="focusable prevent-default"
        on-keydown="arrowdown: #results-2.focus(); arrowup: #search.focus()">Apples</button></li>
  <li role="option"><button id="results-2" implements="focusable prevent-default"
        on-keydown="arrowdown: #results-3.focus(); arrowup: #results-1.focus()">Apricots</button></li>
  <li role="option"><button id="results-3" implements="focusable prevent-default"
        on-keydown="arrowdown: #results-1.focus(); arrowup: #results-2.focus()">Avocados</button></li>
</ul>
```

`requestable-url` / `requestable-target` and bare `send()` match the current `requestable` declaration; re-check only if that file has moved.

## Verification

`pnpm check`, `pnpm build`, `pnpm test` all green on the committed tree. The focusable test asserts: focus moves onto a focusable element and an `tabindex="-1"` `<li>`; an unfocusable `<li>` logs exactly once per element per message containing `did not take` (a repeat on the same element logs nothing, a different element logs once more); blur clears focus with nothing logged; the keyed ArrowDown/ArrowUp combobox fixture roves focus through `#results-1` → `#results-2` → `#results-3` → wrap to `#results-1`, ArrowUp returns to `#search`, and ArrowLeft changes nothing; a wholesale `<ul>` re-fill re-focuses the new `#results-1`. The site smoke test knows `focusable` as a bundle and loads every site page without new console warnings or errors. `rg -n "focusable" src/index.ts rolldown.config.mjs site/demo.src.js tests/site-smoke.test.ts` shows the four registration sites.

## Prohibited Patterns

- No implicit or host-level verb. Verbs come from `implements` and only from `implements` — never from the host, the executor, or an element's tag.
- No `click()`, `remove()`, `scrollIntoView()` or any other `HTMLElement` method as a verb. Parked, not designed.
- Nothing that walks siblings, selects a descendant, keeps a current index, or wraps. `cycleable` is dead in full: no `-target`, no `-wrap`, no candidate rules, no `tabindex` on children.
- No setting `tabindex`, `role` or any `aria-*`. `aria-activedescendant` in particular is never set.
- The library must not depend on or generate server-side ids — the positional-id convention is authoring guidance stated in the README, nothing more.
