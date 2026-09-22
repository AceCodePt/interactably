# Interactably

A declarative interaction language for plain HTML elements.

You write plain HTML. An `on-*` attribute makes a **trigger**; `implements="…"` makes a **receiver**; one `start()` call finds them all ([§ Quick start](#quick-start)).

```html
<script type="module">
  import { start } from "interactably/dist/cdn/interactably-core.js";
  import "interactably/dist/cdn/revealable.js";
  start();
</script>

<button on-click="#modal.show()">Open</button>
<dialog id="modal" implements="revealable">…</dialog>
```

Clicking the button sends the verb `show()` to `#modal`, which implements `revealable`. No page JavaScript.

> **Full documentation:** [acecodept.github.io/interactably](https://acecodept.github.io/interactably/) — the extensive guide, [live examples](https://acecodept.github.io/interactably/examples.html) and the [API reference](https://acecodept.github.io/interactably/reference.html).

- **Triggers** carry `on-<event>` attributes whose value is a tiny DSL: `#id.verb(arg)`.
- **Receivers** `implements` named capabilities (`revealable`, `modifiable`, `listable`, …).
- **Every participating element is attached.** One `start()` call binds trigger listeners, instantiates implementations, and routes interactions between them.
- **No engine, one observer.** A pure parser turns attribute strings into phrases; an executor runs them. One document-level `MutationObserver` (`start()`) decides what participates and when.

---

## Contents

- [Quick start](#quick-start)
- [The trigger grammar](#trigger-grammar)
  - [Grammar](#grammar)
  - [Constructs](#constructs)
  - [Rules](#rules)
  - [Reserved names](#reserved-names)
  - [Expressions](#expressions)
- [The `interaction` event](#interaction-event)
- [Attachment](#attachment)
  - [Four kinds of element](#four-kinds)
  - [Reporting](#reporting)
- [The shipped implementations](#implementations)
  - [The pause mechanism](#the-pause-mechanism)
  - [`prevent-default` and `no-propagate`](#prevent-default)
  - [Revealable](#revealable)
  - [Storable](#storable)
  - [Focusable](#focusable)
- [Writing an implementation](#writing-an-implementation)
  - [Signatures](#signatures)
  - [Declare only what you invent](#declare-only)
  - [`attrs` is a typed proxy](#attrs)
  - [Conventions](#conventions)
- [State: three tiers](#state)
- [Dynamics](#dynamics)
- [Parser and executor](#parser-and-executor)
  - [Pipeline](#pipeline)
  - [Parse cache and resolution](#parse-cache)
  - [Native default actions and propagation](#native-defaults)
- [Asynchrony](#asynchrony)
- [Full examples](#full-examples)
  - [Price calculator](#price-calculator)
  - [Order form — the asynchronous seam](#order-form)
  - [Scroll-spy — synthetic triggers](#scroll-spy)
- [API reference](#api-reference)
- [Why it is built this way](#why-built)
- [When not to use this library](#when-not-to-use)
- [Not supported](#not-supported)
- [Appendix: reference grammar](#appendix-reference-grammar)
- [Appendix: alternatives considered](#appendix-alternatives-considered)

---

## Quick start

```sh
npm install interactably
```

Load the core bundle plus the implementations you use. Each implementation bundle registers itself into the core's registry on import. Then call `start()` once — the single attachment point that wires up everything already in the document.

```html
<script type="module">
  import { start } from "interactably/dist/cdn/interactably-core.js";
  import "interactably/dist/cdn/modifiable.js";
  import "interactably/dist/cdn/revealable.js";
  start();
</script>

<button id="inc" on-click="#qty.set(#qty.value + 1); #preview.set(#qty.value)">+</button>

<label>Qty
  <input id="qty" implements="modifiable"
         type="number" value="1" min="0" max="10"
         on-input="#preview.set(this.value)">
</label>

<output id="preview" implements="modifiable" on-load="this.set(#qty.value)">1</output>
```

Every click on `+` runs `#qty.set(#qty.value + 1)` and then `#preview.set(#qty.value)`; typing in the field still pushes through `on-input`. `#preview`'s own `on-load="this.set(#qty.value)"` computes it once at attach.

Bundle files:

| Bundle | Contents |
| --- | --- |
| `interactably-core.js` | parser, executor, event, attachment, registry. No implementations. |
| `modifiable.js`, `dirtyable.js`, `listable.js`, … | one implementation per file, registering into the core's registry on import |

> **The participation rule.** An element is a participant — something `start()` attaches — when it has `implements`, any `on-*` attribute, or both. Implementations and interactions are independent: an element may have either, both, or neither. If nothing else addresses an element, it does not need an `id`. Adding a brand-new `implements` or `on-*` attribute to an element after insertion does not attach it; re-insert the element.

---

## The trigger grammar

One attribute per interaction; the value is the phrase language.

```html
<button on-click="#pop.show().focus()">
<input  on-input="#echo.set(this.value); #results.debounce(300).filter(this.value)">
<input  on-keydown="escape: this.reset(); enter: #form.validate().send()">
<button on-click="#tour.once().show()">
<button on-click="#pb.show(false); #pc.show(false); #pa.show()">
<button on-click="#note.transform({mode: 'upper', shift: 2})">
<button on-click="#list.removeRow(this)">
<form   on-submit="#order.validate().send() || #alert.show()">
<input  on-change="#form.validate() && #hint.show()">
```

### Grammar

```
value     := phrase (';' phrase)*
phrase    := [key ':'] unit (('&&' | '||') unit)*
unit      := ref ('.' (call | modifier))+
ref       := '#'id | this
call      := verb '(' [arg | object] ')'
arg       := number | 'string' | true | false | ref | read | expr
read      := ref '.' ('value' | 'checked')
expr      := <expression>  (see § Expressions)
object    := '{' name ':' arg (',' name ':' arg)* '}'
modifier  := debounce(ms) | throttle(ms) | once() | delay(ms)
```

### Constructs

| Construct | Example | Meaning |
| --- | --- | --- |
| Trigger | `on-click="#pop.show()"` | On `click`, run the phrase |
| Implementation event | `on-copy="#flash.show()"` | On a copyable element `on-copy` is copyable's event and the native clipboard event doesn't fire it. Continuations now share trigger-attribute `once`/`debounce` semantics |
| Synthetic trigger | `on-intersect-enter="#link.setAttr({name: 'data-visible', value: ''})"` | `IntersectionObserver` against the viewport: `enter`/`leave` fire on the element entering and leaving the box, `full` on the element becoming entirely inside the box or not; the phrase key is the `rootMargin`, and each `;` phrase observes its own margin |
| On-load | `on-load="#panel.open()"` | Runs once at attach, after the element's implementations are instantiated; not a DOM listener |
| Receiver | `#pop.show()` | Send verb `show()` to the element with `id="pop"` |
| Self | `this.reset()` | The element the phrase was read from (the trigger for `on-*`) |
| Chain | `#pop.show().focus()` | `.show()` then `.focus()` on the same receiver, in order |
| Independent | `#pb.show(false); #pa.show()` | Two phrases that run regardless of each other |
| And | `#form.validate() && #hint.show()` | `.validate()` then, only if it completed, `#hint.show()` — possibly on another receiver |
| Or | `#form.validate().send() \|\| #alert.show()` | `#alert.show()` only if a guard aborted the first unit |
| Scalar arg | `#qty.set(#qty.value + 5)` | Numbers, `'strings'`, `true` / `false` |
| Element arg | `#list.removeRow(this)` | A ref resolves to the element at fire time |
| Property read | `#preview.set(this.value)` | `value` / `checked` / `min` / `max` / `step`, the type the element declares; absent `min`/`max` reads empty, absent `step` on a number/range input reads `1` |
| Key | `on-keydown="enter: #f.send()"` | Filter *which* events reach the phrase |
| Object literal | `#note.transform({mode: 'upper', shift: 2})` | One named-argument object |
| Debounce | `#echo.debounce(300).set(this.value)` | Defers this receiver's chain by 300ms; a re-fire restarts the timer; one chain in flight; must sit right after the ref |
| Throttle | `#viewport.throttle(16).zoom(this)` | Leading-edge throttle of this receiver's chain; per element |
| Once | `#tour.once().show()` | Gates the rest of the chain; spent when the walk passes it |
| Delay | `#note.delay(500).reset()` | Pauses the chain where it sits for a fixed ms; re-fires stack, they do not reset it |
| Expression | `#total.set(sum('#list .amount'))` | An argument that is not a literal, ref or read is evaluated as an expression at fire time; selectors appear only inside string arguments |

`<event-type>` is any DOM event type — `on-click`, `on-input`, `on-keydown`, `on-mouseenter`, `on-toggle`, `on-cart-updated`, … The listener is bound on the element itself, so there is no supported-events list. Every trigger names its event; there are no default interactions. Triggers are three kinds: **native DOM events**, **implementation events**, and **synthetic triggers**. An implementation may declare its own events (`copy`, `response`, `request-error`, `restore`); on the element that implements it, `on-<event>` fires only for the implementation's `ImplementationEvent`, never for a same-named DOM event. The synthetic names `on-intersect-enter` / `on-intersect-leave` / `on-intersect-full` are evaluated from an `IntersectionObserver` against the viewport, so they need no `implements` and never warn about a missing event; the phrase key is the observer's `rootMargin` (a `px`/`%` string, a `#id.height`/`#id.width` reference, or nothing for `0px`), and each `;` phrase observes its own margin. `enter` fires when the element's intersection with the box gains non-zero area — including the observer's initial report for an element visible at load — and `leave` fires when it loses it; `full` fires on either side of a change between the element being entirely inside the box and not. `full` means the whole element is inside the box, so an element taller than the box is never `full`; shrink the box with a margin and use `enter` instead. A `-50% 0px 0px 0px` margin shrinks the box to the viewport's vertical centre: `on-intersect-enter="-50% 0px 0px 0px: …"` fires when the element's leading edge reaches that line, for an element of any height.

**Keys and keyed event lists.** Key names match `KeyboardEvent.key` case-insensitively — `enter`, `Enter`, `ENTER` are the same key — and `space` means the space bar; there are no aliases, so `Esc` is not `escape`. A key is a keyboard-event fact: `on-click="enter: #f.send()"` parses, but at fire time the phrase is skipped with a one-time `console.error` (`key "enter" on non-keyboard event "click"; phrase skipped`). The `event:key` entries in the comma-separated config lists (`prevent-default-events`, `no-propagate-events`, [§ prevent-default and no-propagate](#prevent-default)) use the same matcher: each entry is one `event` or one `event:key` pair, a keyed entry only ever matches a keyboard event (a non-keyboard event never carries a `key`), and listing the same pair twice is harmless — the second occurrence is dropped. In the phrase grammar, the same key twice is simply two phrases (`escape: this.reset(); escape: #other.show()`), and both run.

### Rules

1. **Parens are mandatory.** `#pop.show` is a CSS selector; `#pop.show()` is a call.
2. **Receivers are `#id` or `this`.** Ids may not contain `.`, `:`, `&`, `|`, `{`, `}`, `'`, `"` or `#`. Class or attribute selectors are never receivers.
3. **One receiver per unit.** A `.` chain stays on one receiver; `&&`/`||` units may each name a different one. There is no group form: `#a.show(false); #b.show(false)` is still two phrases.
4. **Keys are legal only under `on-keydown` / `on-keyup` and under the three intersect triggers**, one per phrase. Two keyboard keys is two phrases: `enter: #f.send(); numpadenter: #f.send()`. Keyboard names match `KeyboardEvent.key` case-insensitively; `space` means `" "`. Under `on-intersect-enter` / `on-intersect-leave` / `on-intersect-full` the key is that phrase's `rootMargin` — a CSS length/percentage string that selects which crossing fires it (a keyless phrase matches `0px`).
5. **A modifier is a step in a receiver's chain and governs the rest of that chain from where it sits.** `#a.once().x().y()` runs both once ever; `#a.x().once().y()` runs `x` every time and `y` once. It never crosses `&&`: each receiver carries its own modifiers, so `#a.once().x() && #b.y()` runs `#b.y()` every time the first half runs. `debounce`/`throttle` are legal only right after the ref (a timer mid-chain is a parse error); `once` and `delay` may sit anywhere. `once()` must be followed by a call — `#a.x().once()` is a parse error, since a gate over nothing governs the next receiver instead. `once` and `delay` stack and repeat freely, but a receiver chain may carry at most one `debounce`/`throttle` — a second timing modifier is a parse error.
6. **`;` is independent, `.` is sequential and abortable, `&&`/`||` continue across receivers.** A `.` chain stops if a verb's event is `preventDefault()`-ed, if the verb threw, or if no implementation owns the verb. `&&` runs the next unit only if the previous one completed; `||` runs it only if the previous one was stopped by a guard's `preventDefault()`. An error or unowned verb stops both — `||` fires only on a guard abort. One phrase is all `&&` or all `||`; mixing is a parse error. Guards are verbs owned by an implementation that knows the rule; the grammar has no general comparison, by design.
7. **`once()` spends on passing through, not on completion.** The gate is about entry: the moment the walk reaches the `once` it is spent, and whether the rest of the chain then aborts, pauses or fails does not refund it. A spent gate cuts the chain where it sits — links before it still run, links after it never do.
8. **References are late-bound.** `#id`, `this` and reads resolve at fire time (after any debounce), never at parse time.
9. **One argument per verb.** A string signature takes one scalar (`set(5)`); a record signature takes one object literal (`setAttr({name: 'aria-expanded', value: 'true'})`); `"undefined"` takes none. Two bare arguments is a grammar error.
10. **Five properties may be read off a ref** — `value`, `checked`, `min`, `max`, `step` — and two more, `height` and `width`, inside expressions only; each with the type the element declares, no coercion. `this.parentElement` and friends are not legal; relative navigation lives in implementation code.
11. **Selectors appear only inside string arguments** (`'.amount'`, `':scope > li'`). The grammar sees a string; the implementation's schema types it as a selector.
12. **Errors are local.** A missing `#id`, a grammar error, or an argument that fails the signature logs once and skips that phrase/link; the rest of the value runs.

### Reserved names

`debounce`, `throttle`, `once`, `delay` are modifiers — `defineImplementation` throws if any of them is declared as a verb. `this` is the only keyword. `value`, `checked`, `min`, `max`, `step` are property reads, not verbs; an implementation may still define a verb called `value()` (distinguished by its parens).

Ids are addressable only if they avoid the phrase punctuation. An id containing `:`, `&`, `|`, `{`, `}`, `'`, `"` or `#` is a parse error even though it is valid HTML: `#a:b` reads `invalid id "a:b" in #a:b; ids used in phrases may not contain : & | { } ' " #`.

### Expressions

An argument is a literal, a reference, an object literal, or an expression. The expression grammar lives inside the trigger — `#total.set(sum('#list .amount'))`, `this.set(replace(this.value, '\D', ''))` — one language, no second attribute. DRY is not a goal: the same recipe on two triggers is written twice.

```
expression := term (('+' | '-') term)*
term       := factor (('*' | '/') factor)*
factor     := '-' factor | primary
primary    := number | 'string' | reference | function'(' args ')' | '(' expression ')'
reference  := ('#' id | 'this') '.' ('value' | 'checked' | 'min' | 'max' | 'step' | 'height' | 'width')
function   := min | max | floor | ceil | round | sum | count | replace | length
```

`this` in an expression is the element the phrase was read from — the same `this` as in a trigger.

| Construct | Example | Meaning |
| --- | --- | --- |
| Typed read | `this.value`, `#agree.checked`, `#q.min`, `#q.step`, `#nav.height`, `#nav.width` | A read has the type the element declares. `type="number"` / `type="range"` read a number (an empty field stays `""` — the empty-operand error names it, never a silent zero; an unparseable value is not-a-number). `.min`/`.max`/`.step` read the platform's own bounds the same way: a number on `type="number"` / `type="range"` — absent `min`/`max` is `""` (the empty-operand error) and absent `step` is `1`, the platform's declared default — and the string as written elsewhere, so a date's bounds stay date strings. A checkbox/radio reads its checked boolean, whatever the spelling. Every other input/textarea/select reads the platform `.value` string, zeros intact, `inputmode` declaring nothing. Display elements read what their implementation declares: formattable with a numeric format reads its raw `formattable-value` as a number, a date format or a plain element reads `textContent` a string. `.checked` is `el.checked === true`, `false` on an element without one. `.height`/`.width` are the element's border-box size in CSS pixels as of the last layout the browser reported — a phrase that resizes an element and reads it in the same chain reads the previous size |
| `this` | `this.set(this.value + '!')` | Reads the element the phrase was read from — a row cloned from a template computes from its own value with no id |
| Typed `+` | `'invoice-' + #slug.value + '.pdf'` | Joins when either side is a string, adds otherwise, left to right: `'a' + 1 + 2` is `"a12"`, `1 + 2 + 'a'` is `"1a"`. An empty read operand is an empty-operand error, not a silent `""` join — unless a string literal makes the join explicit (`'' + #a.value` stays a join, `#a.value + 1` errors). `-`, `*`, `/`, unary `-` are always arithmetic; a string operand under them is not-a-number naming the reference. `min`/`max`/`floor`/`ceil`/`round`/`sum`/`count`/`length` return numbers; `replace` returns a string. A string literal escapes only the quote and itself (`\'`, `\\`); any other `\x` stays verbatim, so `'\D'` is the three characters `\D` |
| Boolean in arithmetic | `#price.value * #tick.checked` | `true` is `1`, `false` is `0` — the line-item row keeps its shape, with the price on a number element and the tick on the checkbox |
| `sum` / `count` | `sum('#list .amount')` | Run `querySelectorAll` at fire time; `sum` totals number-typed elements and errors on the first that is not, naming it as today; `count` counts. Over checkboxes `sum` totals the ticks as 1/0 — a count of ticked. A `&` in the selector is the element the phrase is on — `sum('li.row:has(&) .amount')` totals the row that contains it |
| `replace` | `replace(this.value, '\D', '')` | Regex replace, always global; the value must read as a string. The pattern is compiled `new RegExp(pattern, "g")`, so `$1`/`$&` in the replacement work as the platform defines them; an invalid pattern is a `FormulaError` naming it |
| `length` | `length(this.value)` | The character count of a string as a number, counted in UTF-16 code units — the same unit `maxlength` uses, so a counter and the platform bound always agree; the argument must read as a string, so on a `type="number"` field it is a `not-a-string` error, never a digit count |

`#id` references and `sum(...)`/`count(...)` selectors resolve against the whole document — scope a set by putting its container's id in the selector (`sum('#list .amount')`). `&` inside the selector is the element the phrase is on — `sum('li.row:has(&) .amount')` totals the row that contains it, `count('& :checked')` counts inside it.

Sharp edge: a checkbox's `value="..."` attribute is unreachable through `.value` — a checkbox reads its checked boolean, whatever the spelling, so the price belongs on a number element and the tick on the checkbox.

Sharp edge: `set()` does not clamp. Say it: `min(#q.max, …)`. Writing past a bound is a real state (`:out-of-range`, `validity.rangeOverflow`), and `validatable` is where it is reported.

Syntax is checked at parse time: `#total.set(1 +)` is a trigger parse error naming the position, reported once per attribute like every other parse error. Fire time only ever carries data errors — empty, not-a-number, division by zero, not-a-string, invalid pattern, a missing reference — each a failed unit, exactly like a throwing verb, reported as `on-<event> on <element>, argument 1 of <verb>(): <reason>`.

Mask on `on-input`, clean on `on-pasted`, same input: `on-input="this.set(replace(this.value, '\D', ''))"` filters keys as you type, and `on-pasted="this.set(replace(this.value, '\D', ''))"` catches what a paste inserts whole — `on-pasted` runs after `on-input` for the same paste, so if both write the value, `on-pasted` wins.

The live character counter under a bounded field is the same shape: `on-input="#bio-count.set(length(this.value) + ' of 200')"` writes "42 of 200" as the textarea fills, and the amber-at-the-edge style is the author's own CSS reading an attribute — `on-input="#bio-count.set(length(this.value) + ' of 200'); this.setAttr({name: 'data-remaining', value: '' + (200 - length(this.value))})"` on `implements="attributable"`, with the `[data-remaining^="1"]`-style rule left to them.

---

## The `interaction` event

The attachment wraps every verb call in its own event, dispatched at the receiver:

```ts
class InteractionEvent extends Event {
  readonly verb: string;          // "show"
  readonly arg: unknown;          // resolved: 5 | "currency" | HTMLElement | { name, value } | undefined
  readonly source: Element;       // the element whose attribute the phrase came from (what `this` resolved to)
  readonly originalEvent: Event;  // click / input / keydown …
  handled = false;                // true when an implementation owned the verb
  error?: unknown;                // set when validation or the verb threw
  result?: unknown;               // the verb's return value
  pauseMs?: number;               // an implementation may set this to defer the rest of the chain
}
```

- **Non-bubbling.** An attached element receives interactions aimed at itself and nothing else — no `if (e.target !== el)` guards.
- **`preventDefault()` aborts the rest of the chain.** This is the guard-verb mechanism: `validate().send()`, with `||` as the failure branch.
- **Four return channels, because a DOM event has none.** `dispatchEvent` swallows listener exceptions and cannot tell "handled" from "nobody listened". So the attachment writes `handled` (an implementation owned the verb), `error` (validation or the verb body threw), `result` (the return value) and `pauseMs` (a verb paused the chain) onto the event, and the executor reads them after dispatch.
- **`pauseMs` defers the chain, it does not abort it.** The `delay(ms)` modifier — and any verb that sets `e.pauseMs = N` — stops the chain where it is, schedules the remainder to run N ms later, and returns. Each re-fire that reaches the same delay schedules its own remainder — they stack, they do not reset each other, so two can be pending at once; superseding is `debounce`'s job. A re-fire gated before it — for example by a spent `once()` — leaves the pending remainder to run. Disconnecting the element drops them — every pending remainder lives in the same per-element state as `debounce`.
- **No `isTrusted` gate.** Tests dispatch real DOM events on triggers.
- **The browser's `command` event plays no part.** A page can also use native invokers; an implementation may listen to `command` like any other DOM event.

---

## Attachment

`start()` attaches every participant — any element with an `implements` or `on-*` attribute — through one document-level `MutationObserver`: the initial document is live at `DOMContentLoaded`, and anything inserted later is live one microtask after insertion. Attach is atomic: the trigger side, the receiver side and on-load all come from one pass, in document order.

**On-load.** `on-load` fires once per attach, after that element's implementations are instantiated. The batch is attached first and its on-load phrases run afterwards in document order, so `<button on-load="#panel.open()">` before `#panel` resolves. A move does not re-fire. A `<template>` is inert — a clone's `on-load` fires once on insertion. The native `load` event is unreachable through the DSL.

**Trigger side.** `attach()` scans the element's `on-*` attributes and binds one listener per attribute on the element:

```ts
for (const attribute of el.getAttributeNames()) {
  if (!attribute.startsWith("on-")) continue;
  const type = attribute.slice(3);
  const handler = (ev: Event) => {
    if (!(ev instanceof ImplementationEvent) && isImplementationEvent(el, type)) return;
    runPhrases(el, el.getAttribute(attribute) ?? "", ev);   // value read at event time
  };
  el.addEventListener(type, handler, { passive: true });                          // the DSL never cancels
  if (!isImplementationEvent(el, type)) {                                          // declared events never warn
    if (!(("on" + type) in el) && !LEGACY_EVENTS_WITHOUT_IDL.has(type))
      console.warn(`[Interactable] on-${type} on ${describe(el)}: <${el.localName}> has no "${type}" event; custom events are fine, but check the spelling and case`);
    warnIfNativeActionLikelyUnwanted(el, type);                                     // <form on-submit>, <a href on-click> without prevent-default
  }
  attachment.triggers.set(attribute, () => el.removeEventListener(type, handler));
}
```

A trigger is live one microtask after insertion, or at `DOMContentLoaded` for the initial document. Detach runs the cleanup list. The `on-*` **value** is read at event time, so editing `on-click="#a.show()"` to `"#b.show()"` takes effect on the next click. Whether a name is an implementation event is also read at event time, from the element's current `implements` — not baked in when the listener binds. An element that gains `implements` or an `on-*` attribute after insertion is not a participant yet — re-insert it.

**Receiver side.** Read `implements`; for each name, check the implementation's `tags` admits `el.localName`, instantiate the factory with `(el, attrs)`, wire the implementation's `on*` methods as listeners on itself, forward lifecycle callbacks, and route `onInteraction(e)` to the **first implementation in `implements` order** that declares `e.verb` — after validating `e.arg` against the verb's signature.

**Readiness.** An `implements` name the registry does not know yet is skipped, and the report is deferred one turn so the imports that follow can register it first; only a name still missing when the current script settles is reported with `console.error`. When it registers later, the registry re-runs the attach pass on every attached element. Markup may therefore precede the imports. Config and state attributes are delivered through one `MutationObserver` per element, never for `on-*` — the three intersect attributes are the one exception, observed statically so the attach pass can rebuild their observers when they change.

### Four kinds of element

| Kind | Has | Example |
| --- | --- | --- |
| **Self-contained** | `implements` | `<textarea implements="autogrowable">` — everything inside via the implementation's own `on*` handlers |
| **Trigger-only** | `on-*` | `<button on-click="#modal.show()">` — causes things elsewhere, never a receiver |
| **Receiver** | `implements` + `id` | `<dialog id="modal" implements="revealable">` — the id exists so others can address it |
| **Self-acting** | `implements` + `on-*` | `<input implements="modifiable" on-keydown="escape: this.reset()">` — triggers on itself |

The fourth kind is why `this` exists: `on-click="this.remove()"` works on every row cloned from a template, with no generated ids.

### Reporting

The attachment and executor report through `console.error` / `console.warn`; they do not throw (attach-time code runs on the browser's stack, which owns its exceptions). `throw` is reserved for `defineImplementation` and the registry, where the exception reaches the developer who wrote the call.

- `console.error` when there is no legitimate reading: unknown `implements` name, tag outside the implementation's `tags`, receiver `#id` not in the document, verb no implementation owns, verb that threw, implementation that failed to attach.
- `console.warn` when the code may well be right but the author should look: `on-<type>` the element has no event for, `<form on-submit>` without `prevent-default`, a verb that returned a promise, `prevent-default` with nothing derived.

---

## The shipped implementations

| Implementation | Tags | Verbs | Config / state | What it does |
| --- | --- | --- | --- | --- |
| `modifiable` | input, textarea, output, select | `set`, `clear`, `reset` | — | typed writes; `set` takes a string, a number, or an expression evaluated at fire time |
| `dirtyable` | input, textarea, select, output | — | `dirty-on`; events `dirty`, `clean` | compares the element's current value with its platform default (`defaultValue`, `defaultChecked`, `defaultSelected`); fires `dirty` / `clean` on transition; writes nothing |
| `formattable` | output, span, div, td, p, li, dd, b, strong, em, small | — | `format` | renders a number/date through `Intl` on display elements; keeps the raw text in `formattable-value`; formats on connect and on every library write |
| `listable` | ul, ol, tbody | `removeRow`, `adopt`, `clear` | `min-rows` | row removal / template adoption / clear, keeping `min-rows` |
| `requestable` | any | `send({method, url})`, `abort` | `url`, `method`, `target`, `swap`, `include`, `concurrency` + `status` state; events `response`, `request-error` | fetch, swap the response into the DOM, fire `response` / `request-error` events |
| `attributable` | any | `setAttr`, `toggleAttr`, `removeAttr` | — | attribute writes (`setAttr({name, value})`) |
| `classable` | any | `add`, `remove`, `toggle` | — | `classList` writes, one class name per call; `toggle` has no force argument — `add`/`remove` are the forced forms |
| `logger` | any | `log` | — | `console.log` from a phrase |
| `validatable` | form, input, select, textarea | `validate` | — | guard verb: `reportValidity()`, `preventDefault()` on failure |
| `no-propagate` | any | — | `events` (default `"click"`) | `stopPropagation` on listed events |
| `prevent-default` | any | — | `events` (derived, see below) | `preventDefault` on listed events |
| `revealable` | any | `show`, `toggle` | `modal` + `open` state | strategies per element ([below](#revealable)) |
| `auto-grow` | textarea | — | — | auto-height textarea; sizes on connect and on `input`/`change`; a value written by script or restored by `storable` is sized on the next input |
| `storable` | any | `save`, `restore`, `clear` | `scope` (`local`/`session`), `key`, `value` | persists a declared slot under a declared key; `restore()` reads it back and fires `restore` only when it matches |
| `pastable` | input, textarea | — | no config | fires `pasted` after a paste has landed, so `this.value` is the new value |
| `copyable` | button | `copy` | event `copy` | copies a target element's text to the clipboard and fires `copy` on success; the flash is the author's (`on-copy`) |
| `focusable` | any | `focus`, `blur` | — | `HTMLElement.focus()` / `blur()` as verbs; reports once if focus did not take |

`attributable` writes attributes whole. `class` is a token list, so `classable` exposes `classList` instead — `#menu.toggle('open')`, one name per call, browser rules for what a name may be.

### The pause mechanism

`delay` is a phrase modifier, not a verb — it pauses the chain where it sits, and everything downstream, including past `&&`, waits, because `&&` is sequential:

```html
<button implements="attributable"
        on-click="this.delay(300).setAttr({name: 'aria-busy', value: 'true'})">…</button>
```

The executor stops the chain at `delay(ms)`, schedules the remainder to run `ms` later, and returns. Each re-fire that reaches the same delay schedules its own remainder — they stack, they do not reset each other, so two can be pending at once; superseding is `debounce`'s job. A re-fire gated before it — for example by a spent `once()` — leaves the pending remainder to run. Every pending remainder is dropped on disconnect. The copy-flash pattern lives in the trigger attribute: `on-copy="this.setAttr({name: 'data-copied', value: 'true'}); this.debounce(1500).removeAttr('data-copied')"` marks the button, and the reset debounced 1.5 s after the last copy. A pause is a scheduling decision the executor owns — never an awaited interaction.

### `prevent-default` and `no-propagate`

The executor never calls `preventDefault()` or `stopPropagation()` (every `on-*` listener is passive). Both facts are said on the element, by name — they are implementations, not grammar.

```html
<form implements="prevent-default no-propagate" no-propagate-events="submit"
      on-submit="#api.send(); #status.set('Saving…')">                                  <!-- derived from on-submit: submit -->

<div implements="prevent-default" prevent-default-events="contextmenu"
     on-contextmenu="#menu.showAt(this)">                                                <!-- not derivable: stated -->

<input implements="prevent-default"
       on-keydown="enter: #search.run(this.value)">                                      <!-- derived from the keyed phrase: keydown:enter -->

<section implements="prevent-default no-propagate"
         prevent-default-events="dragover,drop" no-propagate-events="drop"
         on-drop="#uploads.accept(this)">                                                <!-- not derivable; dragover must be cancelled or drop never fires -->

<canvas implements="prevent-default" prevent-default-events="wheel"
        on-wheel="#viewport.throttle(16).zoom(this)">                                    <!-- never derived: blocks scrolling, always stated -->
```

With `prevent-default-events` omitted, `prevent-default` derives *which* events to cancel from the element's own `on-*` attributes, restricted to `submit`, `click` and `keydown`. A keyed `on-keydown` phrase (`enter: …`) contributes `keydown:enter`; an unkeyed one contributes nothing (a bare `keydown` cancels typing and Tab). Only when the element claims none of the three does the tag decide: `<form>` cancels `submit`, `<a href>` and `<button>` cancel `click`; anything else derives nothing and warns. `prevent-default-events` is a comma-separated list of `event` or `event:key` entries. Entries are one event or one event-key pair each.

A keyed `on-keydown` phrase that *replaces* a browser default should always carry `implements="prevent-default"`. Escape is the case that bites: the browser cancels an in-progress edit (clears `type="search"`, reverts the field to its last committed value) as the keydown **default action**, which runs *after* the page's listeners. So `on-keydown="escape: this.reset()"` on its own sets the value first and the browser then overwrites it — Escape appears to do nothing. Deriving `keydown:escape` cancels that default and leaves the phrase as the only action.

`no-propagate` is its twin: `no-propagate-events`, default `"click"`, handler is `stopPropagation`. Both listen on the element, so both also receive events bubbling up from descendants — put them on the element whose keys or actions are meant, not an ancestor.

### Revealable

`revealable` is the model generic implementation: it declares nothing the platform already holds, derives its strategy from the element at connect, and invents state only where nothing exists. Two verbs and one boolean: `show()` opens, `show(false)` closes, `toggle()` flips.

| Element | Detected by | `show()` | Live state read from |
| --- | --- | --- | --- |
| `<details>` | tag | `el.open = value` | `el.open` |
| `<dialog>` | tag | `el.showModal()` (or `el.show()` with `revealable-modal="false"`); `show(false)` → `el.close()` | `el.open` |
| popover | `el.hasAttribute("popover")` | `el.showPopover()` / `el.hidePopover()` | `el.matches(":popover-open")` |
| anything else | fallback | `revealable-open` | `revealable-open` |

Focus trapping, the top layer, light dismiss, `::backdrop` and Escape handling come with the first three for free; the fourth row is the only one that invents anything.

**Controllers are wired at connect.** When a panel with an `id` connects, `revealable` scans the attached elements — anything carrying an `on-*` attribute — parses each one's `on-*` values through the same cached `parse()` the executor uses, and for every element that *controls* the panel — `#id.toggle()`, `#id.show()`, or `#id.show(true)`; the literal `show(false)` is a side effect, not control, and non-literal arguments such as `show(this.checked)` are not control either — it appends the panel's id to the element's `aria-controls` (deduped, existing tokens preserved) and sets `aria-expanded` to the current state, skipped on radio and checkbox inputs where it is meaningless. The sync continues at fire time: every element whose `aria-controls` names the panel gets `aria-expanded` refreshed, and a bare trigger that declares none gets `aria-controls` added — unless the verb was `show(false)`, which only updates, never claims.

Nothing closes a panel unless a phrase says `show(false)`. Mutually exclusive panels are written out: each trigger names what it opens and what it closes.

### Storable

`storable` persists a declared slot under a declared key through three verbs: `save()`, `restore()` and `clear()`. `storable-key` names the key and `storable-value` the slot that is stored — both are required, and an element missing either is a signature error at attach that names the attribute. The default scope is `local`; `storable-scope="session"` uses `sessionStorage`. Nothing is stored unless a phrase calls `save()` — saving is an act you can see in the markup.

Nothing is restored without `on-load="this.restore()"` on the element. `restore()` reads the slot under the key back and fires the `restore` event only when it matches — the stored value equals the authored `storable-value` — at most once per `restore()` call, never from `save()`; a different stored value changes nothing. `save()` writes the slot under the key; `clear()` removes it. The package-manager example is nine buttons that each say everything they do — `storable-key="pm"`, `storable-value="pnpm"`, an `on-click` naming the three panels it opens, the six it closes and `this.save()`, and `on-load="this.restore()"`.

### Focusable

`focusable` contributes two verbs that call the platform directly: `focus()` calls `HTMLElement.focus()` and `blur()` calls `blur()`; `focus()` reports once, through `console.error`, when the element stayed unfocused — the failure that would otherwise hide. It is how a combobox with a server-rendered options list roves real DOM focus, the MDN "common convention" for popups: the options list is a `<ul>` of `<li><button>`s that `requestable` re-fills on every keystroke, and each option carries an id, `implements="focusable"`, and a phrase pointing at its neighbour:

```html
<input id="search" implements="focusable prevent-default"
       on-keydown="arrowdown: #results-1.focus()">                          <!-- ids are positional and regenerated with each response, so #results-1 is always the current first option -->

<ul id="results">
  <li id="results-1" tabindex="-1" implements="focusable prevent-default"
      on-keydown="arrowdown: #results-2.focus(); arrowup: #search.focus()">first</li>
  <li id="results-2" tabindex="-1" implements="focusable prevent-default"
      on-keydown="arrowdown: #results-3.focus(); arrowup: #results-1.focus()">second</li>
  <li id="results-3" tabindex="-1" implements="focusable prevent-default"
      on-keydown="arrowdown: #results-1.focus(); arrowup: #results-2.focus()">third</li>
</ul>
```

`aria-activedescendant` is not set and must not be — real focus is on the option, so the screen reader announces it as the current item. The library never walks siblings or picks a "first focusable" descendant; every hop is a phrase the server wrote when it generated the list. Wrap-around is whatever the last option's phrase points at, a choice visible in the markup, not a mode. Every keyed `on-keydown` here carries `implements="prevent-default"` so the derived `keydown:arrowdown` / `keydown:arrowup` cancel page scroll and caret movement ([§ prevent-default and no-propagate](#prevent-default)). `blur()` is legal on any receiver, logs nothing, and is a native no-op when the element is not the one focused.

## Writing an implementation

One call declares the name, the tags it may attach to, the config and state it brings, its verb signatures, and the factory — and the factory is type-checked against the signatures.

```ts
import { defineImplementation } from "interactably";

export const modifiable = defineImplementation("modifiable", {
  tags: ["input", "textarea", "output", "select"],
  // no min/max/step here: <input> already has them as el.min / el.max / el.step
  verbs: {
    set:   "string | number",
    clear: "undefined",
    reset: "undefined",
  },
}, (el) => {
  const write = (v: string | number) => {
    const text = String(v);
    if ("value" in el) { if (el.value === text) return; el.value = text; }
    else               { if (el.textContent === text) return; el.textContent = text; }
  };
  return {
    set:   (_e, v) => write(v),
    clear: ()      => write(""),
    reset: () => {
      if (el instanceof HTMLSelectElement) {
        for (const option of Array.from(el.options)) option.selected = option.defaultSelected;
        return;
      }
      write(el.defaultValue);                             // back to what the author wrote
    },
  };
});
```

`defineImplementation(name, { tags?, config?, state?, verbs, events? }, factory)`:

| Field | Type | Meaning |
| --- | --- | --- |
| `name` | `string` | The `implements="…"` word |
| `tags` | `string[]` (optional) | Tags the implementation attaches to; types `el` via `HTMLElementTagNameMap`. Omitted = any tag (`el` is `HTMLElement`) |
| `config` | `Record<string, tsyntax-string>` | Authored input, read-only, stored as `<name>-<key>` (`formattable-format`) |
| `state` | `Record<string, tsyntax-string>` | Invented live state, read/write, stored as `<name>-<key>` (`revealable-open`) |
| `verbs` | `Record<verb, Sig>` | Public surface. `Sig` is a tsyntax string, an element constructor, or a record of those |
| `events` | `string[]` (optional) | Events the implementation dispatches (`copy`, `response`, `request-error`, `restore`); on the element, `on-<event>` fires only for the implementation's `ImplementationEvent` |
| `factory` | `(el, attrs) => Implementation` | Returns the verb bodies and lifecycle/`on*` handlers |

### Signatures

Every `config`, `state` and verb scalar signature is a [tsyntax](https://github.com/AceCodePt/tsyntax) string — the same string is the TypeScript type (`tsc` checks it at the call site) and the runtime check.

- **Scalar slot:** `"string"`, `"number | undefined"`, `"'upper' | 'lower'"`, `` "`${number}px`" ``. When a field has a finite set of legal values, spell the union out.
- **Element slot:** a constructor — `HTMLElement`, `HTMLTemplateElement`, `HTMLButtonElement`. The grammar already knows a bare ref is an element and the executor has resolved it, so what remains is `instanceof`, which the constructor gives along with `InstanceType<>` for the handler parameter.
- **One argument per verb:** a slot (scalar or constructor) or a **record of slots** (one object literal). `"undefined"` declares no argument. Positional lists do not exist, so changing `transform('upper')` to take a second argument forces every call site to become `transform({mode: 'upper', …})` — a loud parse error, never a silent re-bind.

```ts
export const listable = defineImplementation("listable", {
  tags: ["ul", "ol", "tbody"],
  config: { "min-rows": "number | undefined" },
  verbs: {
    removeRow: HTMLElement,                  // any element inside a row
    adopt:     HTMLTemplateElement,
    clear:     "undefined",
  },
}, (el, attrs) => ({
  removeRow: (_e, from) => { const row = from.closest(":scope > *"); if (row && el.children.length > (attrs["min-rows"] ?? 0)) row.remove(); },
  adopt:     (_e, tpl)  => el.append(tpl.content.cloneNode(true)),
  clear:     ()         => { while (el.children.length > (attrs["min-rows"] ?? 0)) el.lastElementChild!.remove(); },
}));

export const attributable = defineImplementation("attributable", {
  verbs: {
    setAttr:    { name: "string", value: "string" },     // object literal argument
    toggleAttr: "string",
    removeAttr: "string",
  },
}, (el) => ({
  setAttr:    (_e, { name, value }) => el.setAttribute(name, value),
  toggleAttr: (_e, name) => el.toggleAttribute(name),
  removeAttr: (_e, name) => el.removeAttribute(name),
}));
```

### Declare only what you invent

An implementation never declares an attribute the platform already owns. `min`, `max`, `step`, `type`, `open`, `value`, `checked`, `popover` exist on the elements they belong to, typed and validated by the browser, reachable as properties: `modifiable` on `<input type="range">` reads `el.min`; `<textarea>` has no `min`, and inventing one would put a meaningless attribute on it. The narrowing is done by `tags` (and, where a tag is not enough, a connect-time `el.type === "range"` check), not by a schema entry. What is left to declare is exactly the information the implementation brings, in two tiers:

- **`config`** — authored input, read on the way in, never written by a verb. Unique by construction (`<name>-<key>`), so two implementations on one element cannot collide.
- **`state`** — live information the implementation holds because the platform holds nothing for it. Stored as `<name>-<key>`, read/write.

Most implementations declare no `state`: `dirtyable`'s closure holds one boolean, the last-reported dirtiness, and its baseline is the platform default — by element kind, `defaultValue`, `defaultChecked` or `defaultSelected` (`defaultValue` is live, so a script writing the `value` attribute moves the baseline); `revealable` on a `<dialog>` reads `el.open`, `modifiable` writes `el.value`. A `state` entry is the exception, and the smell to check is whether the platform already has the thing under another name.

### `attrs` is a typed proxy

Built once per instance by `bindAttributes(el, name, def)`. Each getter reads the attribute live and validates it through the same compiled signature verbs use:

- `config` keys are **getters only** — TypeScript rejects `attrs.format = "…"` and the runtime proxy throws.
- `state` keys also have **setters** that write the `<name>-<key>` attribute (`undefined` removes it); that is the sanctioned way for a verb to mutate invented state. The attribute change then reaches `attributeChangedCallback`, which renders.
- `attrs.format` maps to `formattable-format`, `attrs.open` maps to `revealable-open`; the body spells neither.

### Conventions

- **`on*` methods are event handlers** on the element (`auto-grow`'s `onInput` still works). **Every other method is a verb** and must appear in `verbs`.
- **Verbs receive `(e, arg)`.** `arg` is already validated against the signature. Inputs come from `arg`; `e.source` and `e.originalEvent` are *context*, not input — metadata about the trigger (`aria-expanded` on the button that opened a dialog), not what to act on.
- **Verbs are synchronous.** Do the work, return; the attachment stores the return value on `e.result`. A verb that returns a promise gets a console warning.
- **Lifecycle:** `connectedCallback`, `disconnectedCallback`, `attributeChangedCallback(name, old, new)` may be returned from the factory alongside the verbs.
- **Implementations never call verbs on other elements.** Work that completes later declares **its own events** (`copyable` declares `"copy"`; `requestable` declares `"response"` and `"request-error"`; `storable` declares `"restore"`) and dispatches an `ImplementationEvent` when the moment arrives; the follow-up is a plain `on-<event>` trigger attribute on that element, so `this` in the continuation is the element that did the work.
- **Registering an implementation is idempotent.** The registry records the name once; `defineImplementation` refuses a duplicate. An element whose `implements` names a registered implementation gets it at attach, or when the name registers later.

---

## State: three tiers

A verb's job is to **mutate state**; the reaction (text, classes, ARIA, `hidden`) happens in `attributeChangedCallback` or in response to the platform's own events. Verbs do not render.

| Tier | What it is | Where it lives | Who writes it |
| --- | --- | --- | --- |
| **Authored** | What arrived in the markup: the server's answer, the reset baseline | Attributes: `value`, `min`, `checked`, and our `config` (`formattable-format`) | The author / the server; implementations only read |
| **Live** | Current state, which may have diverged from authored | Properties where the platform has them (`el.value`, `el.checked`, `el.open`, popover state); `<name>-<key>` from our `state` where it does not | Verbs, the user, the platform |
| **Derived** | Presentation | Classes, ARIA, `textContent`, `hidden` | The render callback only |

The `value` attribute / `value` property pair is the canonical case: `el.value = "x"` does not touch the attribute, and that is not an inconsistency — the attribute is what the author wrote, the property is the current value. This is what makes SSR trivial: the server writes `value="42"`, the browser parses it into both tiers, hydration adds nothing.

```ts
// dirtyable — reports one decision as events; the baseline is the platform default
(el, attrs) => {
  const isDirty = () =>
    el instanceof HTMLSelectElement
      ? [...el.options].some((option) => option.selected !== option.defaultSelected)
      : el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio")
        ? el.checked !== el.defaultChecked
        : el.value !== el.defaultValue;
  let dirty = isDirty();                          // the one boolean in the closure; fires nothing at connect
  const evaluate = () => {
    const next = isDirty();
    if (next === dirty) return;
    dirty = next;
    el.dispatchEvent(new ImplementationEvent(next ? "dirty" : "clean"));
  };
  return {
    onInteraction: evaluate,
    onRestore: evaluate,                          // storable's restore is seen directly
    ...(attrs["dirty-on"] === "change" ? { onChange: evaluate } : { onInput: evaluate }),
  };
}
```

`dirtyable` declares no verb; its one closure boolean is the last-reported dirtiness, and the baseline is a platform property, so moving it is a phrase, not a method: on an input, `setAttr({name: 'value', value: this.value})` rewrites the `value` attribute so the live `defaultValue` follows the current value, and after a restore `on-restore="this.setAttr({name: 'value', value: this.value})"` commits the restored value the same way.

```ts
// revealable on a plain panel — the one case with invented state
// state: { open: "boolean | undefined" } → revealable-open
(el, attrs) => ({
  show:   (_e, value) => { attrs.open = value === false ? undefined : true; },
  toggle: () => { attrs.open = attrs.open ? undefined : true; },
  attributeChangedCallback(name) { if (name === "revealable-open") el.hidden = !attrs.open; },   // renders
})
```

Rules:

- **Read the platform before inventing.** `value`, `checked`, `open` on `<details>`/`<dialog>`, popover state, `min`/`max`/`step`. A `state` entry exists only when none of these hold the thing.
- **`config` is read-only.** A baseline is moved by writing the platform's own default property — on an input, `setAttr({name: 'value', value: this.value})` makes the live `defaultValue` follow the current value — never a `config` key.
- **Invented live state is `<name>-<key>`** — one namespace, shared with config, visible in the inspector. Writes go through `attrs`, reads in `attributeChangedCallback`.
- **Closure state** for transient internals (in-flight request, timers).
- **One reader for an element's value.** `readValue(el, property = "value")` dispatches on the element's declared type: number/range inputs read a number (an empty value stays `""`), a checkbox/radio reads its checked boolean, every other input/textarea/select reads the platform `.value` string, and display elements read `formattable-value` as a number when a numeric format is present, else `textContent` a string. `readValue(el, "min" | "max" | "step")` reads the platform's own bound the same way: a number on number/range inputs (absent `min`/`max` is `""`, absent `step` is `1`, the platform's declared default), the string as written elsewhere. An expression reading a value treats a data error as a failed unit.

There is no store, no signals, no cross-element watching. The DOM is the store; ids are the addresses. Whoever changes B fires A.

---

## Dynamics

| Case | Answer |
| --- | --- |
| **Dynamic triggers** (rows cloned from a template) | Rows cloned from a template are attached one microtask after insertion; `on-click="this.remove()"` / `#list.removeRow(this)` works on every clone with no generated ids |
| **Dynamic receivers** (a row's own subtotal) | Receivers stay ids or `this`. Either address a stable ancestor and let the implementation find the relative element from `e.source` (`closest("li")`), or stamp ids in the template |
| **Dynamic data sources** (sum whatever inputs exist) | An expression with a selector: the row's `on-input="#total.set(sum('#list .amount:valid'))"`, and `on-load="this.set(sum('#list .amount:valid'))"` on the total to compute at attach. `sum(selector)` / `count(selector)` run `querySelectorAll` at fire time. `sum` is strict; filter blanks in the selector — `sum('#list .amount:valid')` (blank `required` inputs are `:invalid`), `sum('#list .amount:not(:placeholder-shown)')` (blank inputs carrying a `placeholder`, even `placeholder=" "`), `sum('#list .amount:checked')` sums only ticked checkboxes. A `&` in the selector names the element the phrase is on, so a row can total its own fields — see the row example below |
| **Change without interaction** (server swap, external mutation) | The implementation that performed the change fires its own event (`on-response="#count.set(count('#results > li'))"`), a new synchronous chain with `this` bound to that element |

**Timing is uniform.** Every element — in the initial document or inserted later, server-rendered or cloned from a template — attaches one microtask after insertion, or at `DOMContentLoaded` for the initial document. The microtask gap is the one price of the model: a programmatic `.click()` in the gap runs nothing — await a microtask or use `dispatchInteraction`. Moving an element around the document is a no-op: it stays attached, its instance survives. An element that gains `implements` or an `on-*` attribute after insertion is not attached by that attribute alone — re-insert it.

A row computes its own total with `&`; the value lands on the row as an attribute, displayed by CSS. The phrase sits on the row because `input` bubbles to it; an `<output>` beside the inputs would never hear them:

```html
<li class="row" on-input="this.setAttr({name: 'data-total', value: '' + sum('& .amount')})">
  <input class="amount" type="number" value="10">
  <input class="amount" type="number" value="20">
</li>
```

```css
li.row::after { content: attr(data-total); }
```

Selector rule: **selectors may appear in arguments, never as receivers.** The dispatch graph stays 1:1 — every interaction goes to one element with one `implements`, so completion, grep (`#pop.` finds every writer) and error rules stay exact.

---

## Parser and executor

There is no engine. Two pure functions, both called from the attachment.

### Pipeline

```
DOM event on the trigger (passive listener bound at attach)
  → parse(attributeValue)          cached by string → Phrase[] with unresolved refs
  → runPhrases(this, phrases, ev)
→ key filter
  → run the units in order (one unit, or all `&&` / all `||`)
leading debounce/throttle first (timer keyed by element + attribute + phrase + unit)
      resolve the unit's receiver (#id → getElementById, this → the source); missing → console.error, stop
      for each link in order, modifiers where they sit:
          once() → spent when the walk passes it; a spent gate cuts the chain from there
          delay(ms) → pause the chain; the remainder runs ms later
          resolve arg (scalar, or object literal field by field) → dispatch InteractionEvent
            · attachment: find the implementation owning the verb → e.handled = true
            · attachment: validate arg against the signature, call the verb — both inside try/catch → e.error on throw
            · executor, after dispatch:  !e.handled → console.error "no implementation on <receiver implements=\"…\"> handles verb()", stop
                                          e.error    → console.error once with receiver and verb, stop
                                          e.defaultPrevented → stop the unit, quiet
          `&&`: next unit only if this one completed; `||`: next unit only if this one was guard-aborted
```

Every receiver must be a participant — `#id` and `this` resolve to elements carrying `implements`, and a phrase aimed at an element that owns no such verb is reported as `no implementation on <receiver implements="…"> handles verb()`.

- **Nested triggers behave like nested `onclick`.** A click on a button inside a `<div on-click>` fires the button's phrase, then bubbles and fires the div's. No implicit innermost-wins; suppression is explicit via `no-propagate` on the inner element.
- **Timers and `once` state are keyed per element, per receiver-chain** (in a `WeakMap`) and cleared on disconnect via `clearPhraseState`.
- **Imperative path:** `runPhrases(el, "#pop.show()", someEvent)` is the one entry point, and its first argument is what `this` means — the trigger listener and every implementation-event handler call the same function.

### Parse cache and resolution

`parse` caches by attribute string; the cached value is an AST in which `#id`, `this` and reads are **tokens**, not elements or values. Resolution happens per fire, inside `runPhrases`; two identical rows share one parse and resolve to two different elements. `this` is resolved as `token === "this" ? source : document.getElementById(id)` — never rewritten into the attribute, never stamped into an id, never consulted from `event.currentTarget`.

**Argument validation is the receiver's job, not the parser's.** The parser knows every literal's kind from syntax (bare `5` is a number, `'5'` is a string, `#id` / `this` are elements). Scalars go through `parseValueAgainstDSL` against the slot's tsyntax string; resolved elements go through `instanceof` against the slot's constructor. Reads carry the type the element declares: `this.value` on a number input is a number, on a text input a string, `#agree.checked` a boolean, `#q.min` on a number input a number. An expression argument is resolved to a value at fire time and then validated against the same signature. The system never coerces a read; a verb that wants both types widens its own signature — `modifiable`'s `set` is declared `"string | number"` and writes `String(v)`.

### Native default actions and propagation

The executor does neither. Every `on-*` listener is passive; a phrase describes what happens, not what the browser is allowed to do.

```html
<form implements="prevent-default" on-submit="#api.send()">          <!-- submit cancelled -->
<a    href="/docs"                  on-click="#log.track('docs')">Docs</a>   <!-- navigates and tracks -->
<a    href="#p" implements="prevent-default" on-click="#p.show()">…</a>   <!-- in-page action -->
<button implements="no-propagate" on-click="#list.removeRow(this)">×</button>  <!-- row's on-click untouched -->
```

`prevent-default` binds its own listeners with `passive: false`, so the executor has no list of non-passive events. Because cancellation is explicit, the forgetful case is caught where it is cheap: at attach, an element carrying `on-submit` on a `<form>` (or `on-click` on an `<a href>`, or an **unkeyed** `on-keydown`/`on-keyup` on a `<button>`) without `prevent-default` logs one `console.warn`. A keyed `on-keydown` phrase (`escape: this.reset()`) does not conflict with the button's Enter/Space activation, so it never warns. A pre-existing `defaultPrevented` does **not** suppress dispatch.

---

## Asynchrony

**Verbs are synchronous and chains never await.** This is the HTMX shape the library exists to reproduce: the client says what to send and where the answer goes; everything that takes time happens elsewhere. A `.` chain is a sequence of DOM mutations that runs to completion inside one task, before the browser paints — unless a `delay()` link splits it ([§ The pause mechanism](#the-pause-mechanism)). Work that finishes later belongs to an implementation that owns it — today `requestable` — and continues by dispatching an `ImplementationEvent` the author's `on-response` / `on-request-error` attributes turn into a new synchronous chain.

A chain can still be *paused* without awaiting: `delay(ms)` pauses the chain where it sits, and the executor runs the remainder of the chain `ms` later as its own scheduled step. That is the mechanism behind a "temporarily set attribute" — `copyable` copies and fires `copy` on success; it never touches attributes, so the flash is entirely the author's, in the trigger attribute:

```html
<button implements="copyable attributable"
        on-click="this.copy(#snippet)"
        on-copy="this.setAttr({name: 'data-copied', value: 'true'}); this.debounce(1500).removeAttr('data-copied')">
  <span class="copy-label">Copy</span><span class="copied-label">Copied</span>
</button>
```

`copy` fires its `copy` event on success (`this` is the button); `setAttr` marks the button; the reset runs after the last copy — each copy restarts the 1.5 s `debounce`, so the flash lasts 1.5 s *after the last* copy.

```html
<input id="q" on-input="#results.debounce(300).send()">

<ul id="results" implements="requestable"
    requestable-url="/api/search" requestable-include="#q"
    on-response="#count.set(count('#results > li')); #status.show(false)"
    on-request-error="#status.show()"></ul>
<output id="count" implements="modifiable"></output>
```

The trigger's chain is one synchronous link: `send()` aborts the previous in-flight request for `#results`, starts a new one, and returns. When the response lands, `requestable` swaps its children and dispatches `new ImplementationEvent("response", { originalEvent: e.originalEvent })`; the element's own `on-response` attribute runs a second synchronous chain in which `this` is `#results`. The network gap sits between two chains and has a name and a place in the markup.

`requestable-include` adds matched controls to the request collected as `FormData` would: disabled, unchecked and unselected controls are not sent, a multi-select contributes one entry per selected option, a file input one entry per file, and a matched `<form>` is spread whole. A matched control that already lives inside the requestable form itself is sent twice — the same as two `<input name=x>` in one form.

What this rules out, and why it is the right trade:

| Not possible | Because | Instead |
| --- | --- | --- |
| `#results.send().highlight()` — a link after the response | The chain would have to await, and every question about what happens while it waits (a second fire, a removed receiver, a swapped `#results`) needs an executor answer | `on-response="this.highlight()"` |
| A verb returning a promise | The attachment ignores the value and warns; the chain has already moved on | Start the work in the verb; consume it in the closure; dispatch your own `ImplementationEvent` |
| A guard that asks the server | A guard is a synchronous yes/no; a round trip is a request | `send()` with the check server-side, and `on-request-error` for the no |
| `once()` as a double-submit guard for a request | It spends when the walk passes it, before the request returns, so a failed request leaves a dead trigger | `requestable`'s concurrency policy, below |
| An interaction queued until an implementation arrives | A queued interaction is a chain that waits; the attachment would answer after `dispatchEvent` returned, to nobody | Implementations attach synchronously; a late registration re-runs the attach pass |
| A value comparison in the attribute (`is`, `if`, `==`) | The rule belongs to an implementation | `validatable`'s constraints, or write a verb |

**Concurrency policy belongs to the implementation that owns the I/O.** `requestable` derives it from the method, the way `revealable` derives its strategy from the tag: a GET is idempotent, so a new send aborts the previous one (**latest wins**); anything else may already have happened on the server, so a new send while one is in flight is refused (**first wins**). `requestable-concurrency="latest | first | all"` overrides. Under `all`, every send starts its own request; `abort()` cancels every request in flight. Because `send()` sets `aria-busy="true"` synchronously and clears it when the last in-flight request settles, `form[aria-busy="true"] button { pointer-events: none }` disables the trigger with no JavaScript.

**Continuations run only if the element is still connected.** A response that replaces the requestable element itself (`requestable-swap="outerHTML"`) disconnects it; the `on-response` event is skipped. Cancellation is `AbortError`, which runs neither event and logs nothing.

---

## Full examples

Each example imports the CDN bundles from the package. The core bundle ships inside `interactably-core.js`; per-implementation bundles (`modifiable.js`, `dirtyable.js`, …) register their implementation into the core's registry on import, and `start()` attaches them — importing is the whole setup.

### Price calculator

```html
<script type="module">
  import { start } from "interactably/dist/cdn/interactably-core.js";
  import "interactably/dist/cdn/modifiable.js";
  import "interactably/dist/cdn/dirtyable.js";
  import "interactably/dist/cdn/attributable.js";
  import "interactably/dist/cdn/listable.js";
  import "interactably/dist/cdn/prevent-default.js";
  start();
</script>

<label>Qty
  <input id="qty" implements="modifiable dirtyable attributable prevent-default"
         type="number" value="1" min="0" max="10"
         on-input="#preview.set(this.value)"
         on-dirty="this.setAttr({name: 'data-dirty', value: ''})"
         on-clean="this.removeAttr('data-dirty')"
         on-keydown="escape: this.reset(); #preview.set(#qty.value)">    <!-- prevent-default derives keydown:escape and cancels the browser's native revert -->
</label>
<button on-click="#qty.set(#qty.value - 1); #preview.set(#qty.value)">−</button>
<button on-click="#qty.set(#qty.value + 1); #preview.set(#qty.value)">+</button>
<button on-click="#qty.set(#qty.value + 5); #preview.set(#qty.value)">+5</button>
<button on-click="#qty.reset(); #preview.set(#qty.value)">Reset</button>
<!-- min/max are the input's own; the grammar reads them as #qty.min / #qty.max and modifiable declares nothing for them -->
<output id="preview" implements="modifiable" on-load="this.set(#qty.value)">1</output>

<ul id="list" implements="listable" listable-min-rows="1">
  <li>
    <input class="amount" type="number" on-input="#total.set(sum('#list .amount'))">
    <button on-click="#list.removeRow(this); #total.set(sum('#list .amount'))">×</button>
  </li>
</ul>
<button on-click="#list.adopt(#row-tpl); #total.set(sum('#list .amount'))">Add row</button>
<template id="row-tpl"><li>…</li></template>
<output id="total" implements="modifiable formattable"
        on-load="this.set(sum('#list .amount'))"
        formattable-format="{ style: 'currency', currency: 'USD' }">0</output>
```

Kinds present: `#qty` is self-acting (implementations + `on-*` + id because the buttons address it); the six buttons are trigger-only; `#preview`, `#list` and `#total` are receivers; the `<li>` is a plain element — the row is reached through `#list.removeRow(this)`, so it needs no implementation and no id, and cloning it from `#row-tpl` produces nothing that has to be unique.

**`+5` trace.** The button's `on-click` listener (bound at attach) → `parse("#qty.set(#qty.value + 5); #preview.set(#qty.value)")` (cached) → `runPhrases(button, …, clickEvent)` → resolves `#qty` → the expression `#qty.value + 5` reads `1 + 5` → dispatches `InteractionEvent{verb:"set", arg:6, source: button}` at `#qty` → the attachment validates `6` against `"string | number"` → `modifiable.set` → `write(6)` → the interaction event reaches `#qty`'s own `dirtyable` handler, which fires `dirty` if `#qty` was clean → the second phrase resolves `#preview` → the expression `#qty.value` reads 6 → `set(6)` writes it.

**`×` trace.** Phrase 1 resolves `#list`, arg `this` is the button → `removeRow(e, button)` finds the row via `closest(":scope > *")` → phrase 2 (independent) resolves `#total` → `set(sum('#list .amount'))` re-totals the remaining inputs.

**`Add row` trace.** `#row-tpl` is a bare ref → resolved to the `<template>` → the attachment checks `tpl instanceof HTMLTemplateElement` (the `adopt` slot) → `listable.adopt(e, tpl)` clones the content. Point it at a `<div>` and the attachment logs `expected HTMLTemplateElement, got HTMLDivElement` and aborts the chain; write `'#row-tpl'` in quotes and it is a string, rejected the same way.

### Order form — the asynchronous seam

```html
<script type="module">
  import { start } from "interactably/dist/cdn/interactably-core.js";
  import "interactably/dist/cdn/prevent-default.js";
  import "interactably/dist/cdn/validatable.js";
  import "interactably/dist/cdn/requestable.js";
  import "interactably/dist/cdn/revealable.js";
  start();
</script>

<form id="order" novalidate
      implements="prevent-default validatable requestable"
      requestable-url="/api/orders" requestable-method="post"
      requestable-target="#receipt"
      on-response="#receipt.show(); #alert.show(false)"
      on-request-error="#alert.show()"
      on-submit="this.validate().send() || #validate-alert.show()">
  <input name="qty" type="number" min="1" required>
  <button>Place order</button>
</form>

<section id="receipt" implements="revealable" hidden></section>
<div     id="alert"   implements="revealable" hidden role="alert">Couldn't place the order.</div>
<div     id="validate-alert" implements="revealable" hidden role="alert">Please check the quantity.</div>
```

The form is the receiver of both `validate()` and `send()` in the first unit; `||` switches to `#validate-alert` only when validation aborts. The form is the right receiver: it validates, sends, and knows how to serialise itself (`new FormData(el)`). The trigger is `on-submit`, not a click on the button, so Enter in the field and the button produce the same one event. `prevent-default` with no config derives `submit` from `<form>`.

`send()` takes an optional `{method, url}` that overrides the element's config for that one request — three buttons aiming at one `#api` with different methods, or a row's `send({url: '/items/3'})`. `method` is a fact about the interaction, not the element; where the response goes and how (`requestable-target`, `requestable-swap`) stays a property of the receiver, so those are not overridable per request.

`novalidate` is load-bearing: without it the browser's interactive validation runs first and, for an invalid form, never fires `submit` at all. `novalidate` disables only that interactive step; the constraint API stays, so `reportValidity()` still shows the native bubble. The phrase decides *when* validation happens; the platform still decides *what* valid means.

`validatable` is nearly nothing, which is what a guard verb should be:

```ts
export const validatable = defineImplementation("validatable", {
  tags: ["form", "input", "select", "textarea"],
  verbs: { validate: "undefined" },
}, (el) => ({
  validate: (e) => { if (!el.reportValidity()) e.preventDefault(); },   // false → stop the chain
}));
```

The core of `requestable` (config and swap details elided):

```ts
(el, attrs) => {
  let inflight: AbortController | undefined;
  const policy = () => attrs.concurrency ?? (method() === "get" ? "latest" : "first");   // derived
  const settle = (status?: "error") => { inflight = undefined; attrs.status = status; el.ariaBusy = null; };

  return {
    abort: () => { inflight?.abort(); settle(); },
    send: (e) => {
      if (inflight) {
        if (policy() === "first") return;               // refuse; the earlier request wins
        if (policy() === "latest") inflight.abort();    // supersede
      }
      const ctl = (inflight = new AbortController());
      attrs.status = "loading"; el.ariaBusy = "true";   // synchronous, before paint: CSS can disable the button from this
      fetch(url(el, attrs), init(el, attrs, ctl.signal))
        .then(async (res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const html = await res.text();
          swap(el, attrs, html);
          settle();
          if (el.isConnected) el.dispatchEvent(new ImplementationEvent("response", { originalEvent: e.originalEvent }));
        })
        .catch((err) => {
          if (err.name === "AbortError") return;        // cancelled: not an error, no event
          settle("error");
          if (el.isConnected) el.dispatchEvent(new ImplementationEvent("request-error", { originalEvent: e.originalEvent }));
        });
      // no return value: the verb is synchronous and the chain is complete
    },
  };
}
```

**What each failure path does:**

- **Happy path.** `submit` → `validate` passes → `send` starts the POST (`requestable-status="loading"`, `aria-busy="true"`), returns. Chain complete, two dispatches, well under a frame. On 200, the response swaps into `#receipt`, then `#receipt.show(); #alert.show(false)` runs from `on-response`.
- **Validation fails.** Because of `novalidate` the `submit` event fires anyway; `reportValidity()` shows the browser's bubble and returns false, the verb calls `e.preventDefault()`, the executor stops before `send` and runs the `||` branch instead: `#validate-alert.show()`. Nothing logged, no request.
- **Double submit.** The second `submit` sees `inflight` and the POST policy is `first`, so `send` returns. The button was already inert from `form[aria-busy="true"] button { pointer-events: none }`.
- **Server 500.** `settle("error")`, `requestable-status="error"`, `on-request-error` runs `#alert.show()`. Values kept, button re-enabled, the user retries.
- **A verb throws.** The attachment catches, sets `e.error`, the executor logs once and stops that chain. `#alert.show(false)` is a separate `;` phrase and still runs — that is what `;` promises.
- **Nobody handles it.** `on-response="#receipt.show(); this.reset()"`: `reset` dispatches to the form, none of its implementations owns it, `handled` stays false, and the executor logs `no implementation on form#order handles reset()`. A typo (`sned()`) takes the same path.
- **Response replaces the form.** `requestable-swap="outerHTML"` with no `target`: the swap removes `#order`, the element detaches, `el.isConnected` is false, `on-response` is skipped. The new form carries its own attributes and attaches on insertion.

### Scroll-spy — synthetic triggers

```html
<script type="module">
  import { start } from "interactably/dist/cdn/interactably-core.js";
  import "interactably/dist/cdn/attributable.js";
  start();
</script>

<nav id="toc">
  <a id="toc-intro" implements="attributable" href="#intro">Intro</a>
  <a id="toc-guide" implements="attributable" href="#guide">Guide</a>
</nav>

<!-- each section lights its own link while it is on screen -->
<header id="topnav">…sticky header…</header>
<section id="sec-intro"
         on-intersect-enter="-#topnav.height 0px 0px 0px: #toc-intro.setAttr({name: 'data-visible', value: ''})"
         on-intersect-leave="-#topnav.height 0px 0px 0px: #toc-intro.removeAttr('data-visible')">…</section>
<section id="sec-guide"
         on-intersect-enter="-#topnav.height 0px 0px 0px: #toc-guide.setAttr({name: 'data-visible', value: ''})"
         on-intersect-leave="-#topnav.height 0px 0px 0px: #toc-guide.removeAttr('data-visible')">…</section>
```

`on-intersect-enter` fires when a section becomes intersecting and `on-intersect-leave` when it stops, so each section sets and clears its own link's `data-visible`; several links may be lit at once when several sections are visible — a true report, not a single current item. There is no hash: scrolling is not navigation, nobody chose the position, and the browser already restores scroll on reload. A margin key narrows the window: `on-intersect-enter="-50% 0px 0px 0px: #a.mark()"` fires when the section's leading edge reaches the viewport's vertical centre, and each `;` phrase under one attribute observes its own margin, so `on-intersect-enter="-50% 0px 0px 0px: #a.mark(); 0px: #b.mark()"` is two observers on one attribute. A margin may also read a measured element: the key `-#topnav.height 0px 0px 0px:` shrinks the box by the sticky header's height, read from the header itself instead of restating the number, so a style change to the header rebuilds the observers on resize.

**Note.** `on-intersect-enter` no longer fires on leaving. It fires only when the element becomes intersecting; use `on-intersect-leave` for the other direction.

---

## API reference

All from `interactably` (or `interactably/dist/cdn/interactably-core.js` for the core subset).

| Export | What it is |
| --- | --- |
| `defineImplementation(name, decl, factory)` | Declare an implementation ([§ Writing an implementation](#writing-an-implementation)) |
| `start(root = document)` | Attach every participant under root and watch it for insertions and removals; idempotent per root; returns a dispose function. Defers the initial scan to `DOMContentLoaded` when called during parse ([§ Attachment](#attachment)) |
| `registerImplementation(def)` | Register a normalized definition (used by `defineImplementation`). Throws if the name is already registered — the realistic cause is two copies of a behaviour in one page (a CDN bundle plus a re-export); dev-server HMR without a page reload is not supported |
| `getImplementationDef(name)` | Look up a registered definition |
| `runPhrases(el, value, ev)` | Run an attribute string against an element and a DOM event; the one entry point |
| `parse(value, eventName?)` | Parse an attribute string into phrases (cached by event name and value) |
| `dispatchInteraction(el, verb, arg?, opts?)` | Imperatively send a verb; throws on unhandled/error, returns `result` |
| `InteractionEvent` | The event class ([§ The interaction event](#the-interaction-event)) |
| `ImplementationEvent` | The event an implementation dispatches for a declared event (`copy`, `response`, `request-error`, `restore`); a synthetic intersect event carries the observed margin as `key` |
| `isImplementationEvent(el, type)` | True when `type` is an intersect name or an event some implementation on `el` declares |
| `clearPhraseState(el)` | Drop timers / `once` / log state for an element |
| `syncIntersect(el)` / `teardownIntersect(el)` | Create / drop the element's `IntersectionObserver`s, one per `rootMargin` |
| `normaliseRootMargin(margin?)` | Normalise and validate a CSS root-margin string: `px`/`%` lengths or `#id.height`/`#id.width` references, 1–4 tokens (`undefined`/empty → `"0px"`; throws otherwise) |
| `readMeasured(el, dim)` | The element's border-box `height`/`width` in CSS pixels as of the last layout the browser reported — the cache behind `#id.height`/`#id.width` |
| `INTERSECT_EVENT_NAMES` | The synthetic intersect names (`intersect-enter`, `intersect-leave`, `intersect-full`) |
| `matchesKey(ev, name)` | The key matcher (`space` → `" "`, case-insensitive) used by keys and event lists |
| `compileSignature(sig)` | Compile a slot/record signature to a validator |
| `bindEvents(el, events, handler, opts?)` | Shared listener binder for `prevent-default` / `no-propagate` style implementations |
| `readValue(el, property = "value")` | The element's value with the type its declaration decides: number/range read a number, checkbox/radio read their checked boolean, other inputs/textarea/select read `.value` (a string), display elements read `formattable-value` as a number under a numeric format, else `textContent` (a string); `readValue(el, "checked")` is the checked boolean; `readValue(el, "min" | "max" | "step")` is the platform bound — a number on number/range inputs (absent `min`/`max` is `""`, absent `step` is `1`), the string as written elsewhere |
| `writeValue(el, v)` | Write helper: sets `.value` where the element has one, else `textContent` |
| `NotReadyError` | Error set on `e.error` when a dispatch reaches an attached element whose `implements` names an implementation that has not registered yet |
| Implementations | `modifiable`, `dirtyable`, `listable`, `requestable`, `attributable`, `classable`, `logger`, `validatable`, `noPropagate`, `preventDefault`, `revealable`, `autoGrow`, `storable`, `pastable`, `copyable`, `formattable`, `focusable` |

---

## Why it is built this way

The short versions of the decisions behind the design. The full argument for each was weighed and settled; the summary is enough to navigate.

- **Our own attribute and event** (`on-*`, `interaction`), not the browser's `command`/`commandfor`. No negotiation with native verb names, no deferral table, no double dispatch; native invokers coexist on the same button.
- **One attribute per event** — no default-interaction table, a busy element reads like any multi-attribute element.
- **`#id.verb(arg)` is member access** and semantically honest: the element has `show` because it implements `revealable`. It completes from the left and is a shape models produce reliably.
- **One argument per verb**: a scalar or one object literal. Positional lists were rejected because schema order is invisible in HTML — inserting an argument in the middle would silently re-bind every call site. A signature change is a loud parse error instead.
- **`;` independent, `.` sequential and abortable** — two separators, two meanings, which is what justifies keeping both.
- **`&&` / `||` continue across receivers, and `||` is guard-only.** A guard's `preventDefault()` is the one stop the phrase can observe synchronously, so it is the only stop `||` reacts to; errors and unowned verbs are bugs and stay loud. `&&` is the success branch. They exist because validation failure was otherwise a dead end — sibling `;` phrases run regardless and no verb can observe another's abort. One operator per phrase keeps precedence and associativity out of the grammar.
- **`once()` spends on passing through** so `#a.once().x().y()` means "x and y run once ever, together"; the gate is about entry, and an abort or pause after it never refunds it.
- **No class or selector receivers.** Classes are global; scoping is a selector language; a selector language is jQuery. Containers + scoped selector *arguments* cover the dynamic-set case with a 1:1 receiver graph.
- **Triggers are attached, not delegated.** One place decides anything about an element. Cost: one `MutationObserver` on the document and a microtask between insertion and liveness.
- **Uniform timing over synchronous-somewhere.** One attachment path for every element — initial scan and later insertions alike — instead of a fast synchronous path somewhere and a slow deferred one elsewhere.
- **`this` for the trigger** — the word inline handlers have bound to the element for thirty years.
- **Parse once, resolve per fire.** `#id` / `this` stay tokens in the cached AST; two identical rows share a parse and bind to different elements. Nothing is rewritten into the DOM.
- **Nested triggers bubble** like inline handlers; `no-propagate` on the inner element is the explicit opt-out, not an implicit rule the executor enforces with a `closest()` walk per event.
- **Signatures are tsyntax strings** — the same string is the TypeScript type and the runtime check, at 3.6 KB, with no second schema vocabulary. Elements are constructors because tsyntax's check is `typeof` and cannot tell a button from a template.
- **Declare only what you invent.** Platform attributes are read off the element, never declared; `config` is read-only authored input; invented live state is `<name>-<key>`.
- **Strategies are derived, not declared.** `revealable` picks its behavior from the element at connect instead of an author-written `strategy=` attribute.
- **Default actions and propagation are implementations**, not executor rules or phrase modifiers — they are event-scoped facts and live on the element where a reader finds them. Only the *which* is derived, never the *whether*.
- **Verbs are synchronous.** Every async question (second fire, removed receiver, `once` while pending, latest vs first) is a question only the implementation doing the work can answer. The network gap is a named attribute, not a disguised dot.
- **Pauses are modifiers, not verbs.** `delay` sits in the chain like `once` and pauses where it sits — `this.delay(300).setAttr(...)` reads forward, and everything downstream, including past `&&`, waits. The executor owns the pause timer exactly like the debounce timer, so a pause never becomes an awaited interaction.
- **Four return channels on the event.** `dispatchEvent` swallows listener exceptions and cannot tell "handled" from "nobody listened"; the attachment is the last frame that can catch, so it reports `handled` / `error` / `result` and `pauseMs` (a verb paused the chain) on the event.
- **Readiness is reported, never awaited.** A late-registered implementation re-runs every attached element's attach pass; markup may precede the imports.
- **Report with `console.error`/`warn`, throw only at definition time.** Attachment code runs on the browser's stack, which owns its exceptions.

---

## When not to use this library

**This is a push system, not a pull one.** An event on a trigger pushes a verb onto a named receiver, the DOM changes once, and the interaction is over — there is no subscription, no reactivity, and no derived state. Nothing watches a value and re-runs phrases when it changes.

The tabs example is the honest boundary case. Each button's `on-click` pushes `show()` onto its panels, and the six it closes; "which tab is visible" is never stored — every switch rewrites the panels' visibility by hand. Adding a fourth section means editing every phrase, because the push is the whole mechanism. That is the price of push: the wiring that replaces a state variable grows with the page.

When the behaviour you need *pulls* — a value kept in sync with other values, recomputed on change, reactive by construction — a reactive/data-flow framework is the right tool. The one async seam this library does own is `requestable`: the trigger pushes `send()`, and `on-response` / `on-request-error` continue from the element that did the work.

Input masks and format-as-you-type belong in a component library built on the same elements: both are caret-dependent, and formatting under a caret is not declarative. So does a visible-formatted / hidden-raw `<input>` pair, which needs markup of its own to fake. `formattable` is the whole declarative share — display elements only, formatted on connect and on each library write.

---

## Not supported

Shadow DOM (events are non-composed; receivers are document ids) · modifier keys (`.ctrl`), `.self`, `.outside` (reserved as future postfix modifiers) · class receivers · property access beyond `value` / `checked` / `min` / `max` / `step` (and `height` / `width` in expressions) · attaching an element that gains `implements` or an `on-*` attribute after insertion (re-insert it) · a per-trigger `preventDefault` opt-out · nested objects or arrays as arguments · variadic verbs · rendering data through a template (the behaviour was removed; `listable.adopt(#tpl)` stamps a template as written, and the triggers work from there) · the native paste event (`on-paste` is not a trigger; `on-pasted` fires after the insertion) · a template-literal type over a whole `on-*` value (possible, not needed for v1).

`on-load` always means attach, including on `<img>`, `<iframe>`, `<body>`, `<link>`, `<script>`; it is never the native `load` event — bytes-arrived is `addEventListener('load', …)`.

---

## Appendix: reference grammar

```
attribute := 'on-' event-type
value     := phrase (';' phrase)*
phrase    := [key ':'] unit (('&&' | '||') unit)*
unit      := ref ('.' (call | modifier))+
ref       := '#' id | 'this'
call      := verb '(' [arg | object] ')'
arg       := number | "'" string "'" | 'true' | 'false' | ref | read | expr
read      := ref '.' ('value' | 'checked' | 'min' | 'max' | 'step')
expr      := <expression>  (see § Expressions)
object    := '{' field (',' field)* '}'
field     := name ':' arg
modifier  := 'debounce(' ms ')' | 'throttle(' ms ')' | 'once()' | 'delay(' ms ')'
```

Whitespace is insignificant outside string literals. `id` excludes whitespace, `,`, `;`, `.`, `(`, `)`, `:`, `&`, `|`, `{`, `}`, `'`, `"`, `#`. `name` is an identifier. `this` is a keyword; an element with `id="this"` is addressed as `#this`. A `unit` must contain at least one call; `debounce`/`throttle` are legal only before the first call, at most one per unit, while `once`/`delay` may sit anywhere. `&&` and `||` are top-level unit separators, recognized only outside string literals and argument parens/braces; a phrase may use one of them, never both. Which of `arg` / `object` / nothing a call accepts is decided by the verb's signature, not by the grammar.

**Signature language** (values in `config`, `state` and `verbs`): a **slot** is either a tsyntax scalar DSL string (`string`, `number`, `bigint`, `boolean`, `undefined`, numeric and quoted literals, template literals, `|` unions) or an element constructor (`HTMLElement`, `HTMLTemplateElement`, …). A verb signature is one slot or a flat record of slots; an attribute signature is one string slot. A record key whose slot admits `undefined` may be omitted from the object literal; any other key is required.

---

## Appendix: alternatives considered

Questions a reader may ask, with the answer they got. Each is the decision the body summarizes; the long form was settled and set aside.

**Why not delegate `on-*` from a document-level engine?** The observer is now paid for either way; the question is what sits behind it. Delegation costs a supported-events list, an ancestor walk per event, a non-passive-listener problem (a delegated listener cannot decide `passive` per event), and an unknown-event error class — and `this` in a phrase would resolve to the event's current target, not the element that declared it. Binding on the element keeps `this`, passive listeners, and one place deciding anything about an element.

**Why re-read the `on-*` value at fire time instead of parsing once at connect?** Server swaps are a new node either way. They differ for in-place edits: re-reading makes the edit take effect on the next fire; parsing at connect makes the DOM lie unless per-element observers are added.

**Why `this.value` rather than a `$value` keyword?** `$value` had to be learned; `this.value` is already known by people and by models, it can read any ref (not just the trigger), and it drops the coercion `$value` needed. Why not general property access? Because that is an expression language, and every safety claim rests on there not being one.

**Why `this` rather than `$self` or `$source`?** `this` is the inline-handler word for exactly this element, needs no explanation, and works in both the receiver slot and the argument slot — one word replaces two.

**Why is there no key list, `enter, numpadenter: #f.send()`?** It is one phrase standing for two, and every per-phrase mechanism (does Enter spend `once()` for NumpadEnter? do debounce timers merge?) then has to pick an answer. `;` already writes two phrases.

**Why isn't an empty field zero?** Because zero is an answer and an empty field is the lack of one — a blank quantity multiplied into a total of `0` invents the answer. The library refuses to invent it: an empty or non-numeric operand is a fire-time error, and the author filters blanks in the selector (`:valid`, `:not(:placeholder-shown)`) when a set is allowed to have gaps.

**Why is there no group receiver, `(#a, #b).show(false)`?** The chain aborts per receiver, so the group form is exactly `#a.show(false); #b.show(false)` with a second spelling and a bookkeeping key that has to survive `#b` being replaced in the DOM. A shorthand that needs a paragraph is not a shorthand.

**Why not innermost-wins when triggers nest?** It is a `closest()` walk per trigger per event, added solely to suppress the outer phrase in a rare case — and inline handlers fire inner and outer, so matching that is the least surprising default.

**Why not positional argument lists, `transform('upper', 2)`?** The binding between position and meaning lives in schema order, which nothing in HTML can see. One scalar or one object literal makes a signature change a loud parse error instead.

**Why not declare signatures inside the factory, `set: verb("string", fn)`?** One site, but the factory would have to run against a detached element at registration just to learn the verbs. A static `verbs` table is pure data: serialisable for tooling, checked against the factory in both directions by TypeScript.

**Why not `element` and `selector` as tsyntax keywords?** tsyntax validates keywords with `typeof`, which cannot distinguish a button from a template; an element slot needs `instanceof`. And nothing makes a string a selector except that an implementation feeds it to `querySelectorAll` — that is documented by the record key, not a type.

**Why doesn't `modifiable` declare `min` and `max`?** `<input>` already has them, typed, as `el.min` / `el.max`; `<textarea>` does not have them at all. A declaration lists what the implementation brings; platform attributes are read, not declared.

**Why doesn't the executor cancel the native default for `<form on-submit>`?** A table in the executor is an implicit mechanism next to the explicit `no-propagate`, and it has to decide at event time, before debounce and before refs resolve — where it collides with late binding. Moving cancellation to `prevent-default` removes the decision rather than answering it.

**Why not `.prevent()` / `.native()` / `.stop()` as phrase modifiers?** `debounce` / `throttle` / `once` / `delay` are per receiver chain and legitimately so; an event has one default action and one propagation path, so a per-phrase flag needs a rule for phrases disagreeing about something that is not theirs. Event-scoped statements belong on the element.

**Why not extend the native Invoker Commands API?** Sharing the attribute and event with the browser forces a `--` prefix negotiation for custom verbs, a native-default deferral table, an `originalEvent`-presence convention, and a double-dispatch risk on `<dialog>`. An attribute and event the browser does not know about have none of these problems.

**Why not two repositories, engine and implementations?** The parser and executor are imported by the attachment and ship in the same bundle; a second repo is a second release cadence for one consumer.

**Why not customized built-in elements (`is=`)?** That was the first design. WebKit's position makes them permanently polyfilled on one engine, and a polyfilled foundation is disqualifying for a library whose premise is that generators recommend it. The observer gives one timing rule instead of two.

The platform direction that matches this design is custom attributes for all elements (WICG/webcomponents#1029); when it ships, `start()` becomes a shim.

**Why don't chains await a verb's promise?** Every question it raises (a second fire mid-flight, a removed receiver while awaiting, `once()` while pending, latest vs first) is answerable only by the implementation doing the work. Verbs are synchronous; the implementation dispatches its own `ImplementationEvent` when the work finishes.

**Why `handled` and `error` on the event rather than exceptions?** `dispatchEvent` swallows listener exceptions and returns normally. An async wrapper would fix throws by making every chain asynchronous; a direct method call would add a second dispatch path. Fields on the event fix both with no change to either.

**Why not a general `<name>-after` convention for every implementation?** The word is shared, the event is not: a request failing and an upload failing call for different follow-ups. Each implementation names the moments it exposes as events (`copy`, `response`, `request-error`, `restore`); the phrase for each is a plain `on-<event>` trigger attribute, and only dispatch is shared.

**Why not queue an interaction until the lazily loaded implementation arrives?** A queue is a waiting chain, and the attachment would answer the event after `dispatchEvent` returned, when the executor had already read the channels. With implementations imported before the markup, the case never occurs.

**Why `&` in a selector, not a scoped-query construct?** `&` is one node, not a CSS match set: CSS's `&` inherits a match condition from the parent rule, but here the element the phrase is on is one specific node, so `& .amount` reads "my descendants" and `li.row:has(&)` reads "the row that contains me". Splitting the string at `:has(&)` and walking up with `closest` was rejected: it works for that one shape and quietly misbehaves the moment an author adds a combinator inside the `:has` or a sibling selector after it — the author wrote valid CSS, and the failure would be unexplainable. A tag/class/id descriptor standing in for `&` was rejected because every stamped row carries the same shapes — `li.row:has(input.qty)` matches every row, and clones are the whole point.