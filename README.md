# Interactably

A declarative interaction language for **customized built-in web components**, and the host that runs it.

You write plain HTML. `is="interactable-<tag>"` turns an element into a **host**. An `on-*` attribute makes it a **trigger**; `implements="…"` makes it a **receiver**. The auto-loader can add `is=` for you, so the markup can stay plain HTML ([§ Quick start](#quick-start)).

```html
<button is="interactable-button" on-click="#modal.show()">Open</button>
<dialog is="interactable-dialog" id="modal" implements="revealable">…</dialog>
```

Clicking the button sends the verb `show()` to `#modal`, which implements `revealable`. No page JavaScript.

> **Full documentation:** [acecodept.github.io/interactably](https://acecodept.github.io/interactably/) — the extensive guide, [live examples](https://acecodept.github.io/interactably/examples.html) and the [API reference](https://acecodept.github.io/interactably/reference.html).

- **Triggers** carry `on-<event>` attributes whose value is a tiny DSL: `#id.verb(arg)`.
- **Receivers** `implements` named capabilities (`revealable`, `modifiable`, `listable`, …).
- **Every participating element is a host.** The host binds trigger listeners, instantiates implementations, and routes interactions between them.
- **No engine.** A pure parser turns attribute strings into phrases; an executor runs them. Both are functions the host calls.

---

## Contents

- [Quick start](#quick-start)
- [The trigger grammar](#the-trigger-grammar)
- [The `interaction` event](#the-interaction-event)
- [Hosts](#hosts)
- [The shipped implementations](#the-shipped-implementations)
- [Writing an implementation](#writing-an-implementation)
- [State: three tiers](#state-three-tiers)
- [Dynamics](#dynamics)
- [Parser and executor](#parser-and-executor)
- [Asynchrony](#asynchrony)
- [Full examples](#full-examples)
- [API reference](#api-reference)
- [Why it is built this way](#why-it-is-built-this-way)
- [When not to use this library](#when-not-to-use-this-library)
- [Not supported](#not-supported)
- [Appendix: reference grammar](#appendix-reference-grammar)
- [Appendix: alternatives considered](#appendix-alternatives-considered)

---

## Quick start

```sh
npm install interactably
```

Load the core bundle plus the implementations you use. Each implementation bundle registers itself into the core's registry on import, and defines the hosts for its declared tags. There are two ways to write the markup; both produce the same page.

**Option A — the auto-loader (simplest).** Import `installAutoLoader()` and omit `is=` entirely. It upgrades every element that has `implements` or an `on-*` attribute:

```html
<script type="module">
  import "interactably/dist/cdn/modifiable.js";
  import "interactably/dist/cdn/revealable.js";
  import { installAutoLoader } from "interactably/dist/cdn/auto-loader.js";
  installAutoLoader();
</script>

<button id="inc" on-click="#qty.inc(); #preview.compute()">+</button>

<label>Qty
  <input id="qty" implements="modifiable"
         type="number" value="1" min="0" max="10"
         on-input="#preview.set(this.value)">
</label>

<output id="preview" implements="modifiable" modifiable-formula="#qty.value">1</output>
```

**Option B — explicit `is=` (faster).** State the host name yourself; the element upgrades synchronously on insertion in Chrome and Firefox, with no observer and no node replacement:

```html
<script type="module">
  import "interactably/dist/cdn/modifiable.js";
  import "interactably/dist/cdn/revealable.js";
  import { defineInteractableHost } from "interactably/dist/cdn/interactably-core.js";
  defineInteractableHost("button");   // idempotent; a <button> trigger has no implementation declaring it
</script>

<button is="interactable-button" id="inc" on-click="#qty.inc(); #preview.compute()">+</button>

<label>Qty
  <input is="interactable-input" id="qty" implements="modifiable"
         type="number" value="1" min="0" max="10"
         on-input="#preview.set(this.value)">
</label>

<output is="interactable-output" id="preview" implements="modifiable" modifiable-formula="#qty.value">1</output>
```

Every click on `+` calls `#qty.inc()` (the input clamps to `max`) and then `#preview.compute()`, which re-reads `#qty.value`; typing in the field still pushes through `on-input`.

Bundle files:

| Bundle | Contents |
| --- | --- |
| `interactably-core.js` | parser, executor, event, host, registry. No implementations. |
| `modifiable.js`, `dirtyable.js`, `listable.js`, … | one implementation per file, registering into the core's registry on import |
| `auto-loader.js` | optional: watches the DOM and adds `is=` to any element with `implements` or an `on-*` attribute |

> **`is=` rule.** An element carries `is="interactable-<tag>"` when it has `implements`, any `on-*` attribute, or both. Implementations and interactions are independent: an element may have either, both, or neither. If nothing else addresses an element, it does not need an `id`. The auto-loader fills `is=` in at runtime so you can omit it; writing it yourself is the synchronous, production form.

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
arg       := number | 'string' | true | false | ref | read
read      := ref '.' ('value' | 'checked' | 'valueAsNumber')
object    := '{' name ':' arg (',' name ':' arg)* '}'
modifier  := debounce(ms) | throttle(ms) | once() | delay(ms)
```

### Constructs

| Construct | Example | Meaning |
| --- | --- | --- |
| Trigger | `on-click="#pop.show()"` | On `click`, run the phrase |
| Implementation event | `on-copy="#flash.show()"` | On a copyable element `on-copy` is copyable's event and the native clipboard event doesn't fire it. Continuations now share trigger-attribute `once`/`debounce` semantics |
| Synthetic trigger | `on-intersect-enter="#link.setAttr({name: 'data-visible', value: ''})"` | `IntersectionObserver` against the viewport: `enter`/`leave` are presence transitions, `half`/`full` are threshold crossings in either direction; the phrase key is the `rootMargin`, and each `;` phrase observes its own margin |
| Receiver | `#pop.show()` | Send verb `show()` to the element with `id="pop"` |
| Self | `this.reset()` | The element the phrase was read from (the trigger for `on-*`) |
| Chain | `#pop.show().focus()` | `.show()` then `.focus()` on the same receiver, in order |
| Independent | `#pb.show(false); #pa.show()` | Two phrases that run regardless of each other |
| And | `#form.validate() && #hint.show()` | `.validate()` then, only if it completed, `#hint.show()` — possibly on another receiver |
| Or | `#form.validate().send() \|\| #alert.show()` | `#alert.show()` only if a guard aborted the first unit |
| Scalar arg | `#qty.inc(5)` | Numbers, `'strings'`, `true` / `false` |
| Element arg | `#list.removeRow(this)` | A ref resolves to the element at fire time |
| Property read | `#preview.set(this.value)` | `value` / `checked` / `valueAsNumber`, the platform's own types |
| Key | `on-keydown="enter: #f.send()"` | Filter *which* events reach the phrase |
| Object literal | `#note.transform({mode: 'upper', shift: 2})` | One named-argument object |
| Debounce | `#echo.debounce(300).set(this.value)` | Defers this receiver's chain by 300ms; must sit right after the ref |
| Throttle | `#viewport.throttle(16).zoom(this)` | Leading-edge throttle of this receiver's chain; per element |
| Once | `#tour.once().show()` | Gates the rest of the chain; spent when the walk passes it |
| Delay | `#note.delay(500).reset()` | Pauses the chain where it sits; downstream links — even past `&&` — wait |
| Selector | `modifiable-formula="sum('#list .amount')"` | Selectors appear only inside string arguments |

`<event-type>` is any DOM event type — `on-click`, `on-input`, `on-keydown`, `on-mouseenter`, `on-toggle`, `on-cart-updated`, … The listener is bound on the element itself, so there is no supported-events list. Every trigger names its event; there are no default interactions. Triggers are three kinds: **native DOM events**, **implementation events**, and **synthetic triggers**. An implementation may declare its own events (`copy`, `response`, `request-error`); on the element that implements it, `on-<event>` fires only for the implementation's `ImplementationEvent`, never for a same-named DOM event. The synthetic names `on-intersect-enter` / `on-intersect-leave` / `on-intersect-half` / `on-intersect-full` map to `IntersectionObserver` thresholds 0, 0, 0.5 and 1 with the viewport as root, so they need no `implements` and never warn about a missing event; the phrase key is the observer's `rootMargin` (a CSS length/percentage string, or nothing for `0px`), and each `;` phrase observes its own margin. `enter` fires when the element becomes intersecting — including the observer's initial report for an element visible at load — and `leave` fires when it stops; both observe threshold 0 and share one observer per margin. `half` and `full` fire on every threshold crossing, in either direction.

### Rules

1. **Parens are mandatory.** `#pop.show` is a CSS selector; `#pop.show()` is a call.
2. **Receivers are `#id` or `this`.** Ids may not contain `.`. Class or attribute selectors are never receivers.
3. **One receiver per unit.** A `.` chain stays on one receiver; `&&`/`||` units may each name a different one. There is no group form: `#a.show(false); #b.show(false)` is still two phrases.
4. **Keys are legal only under `on-keydown` / `on-keyup` and under the four intersect triggers**, one per phrase. Two keyboard keys is two phrases: `enter: #f.send(); numpadenter: #f.send()`. Keyboard names match `KeyboardEvent.key` case-insensitively; `space` means `" "`. Under `on-intersect-enter` / `on-intersect-leave` / `on-intersect-half` / `on-intersect-full` the key is that phrase's `rootMargin` — a CSS length/percentage string that selects which crossing fires it (a keyless phrase matches `0px`).
5. **A modifier is a step in a receiver's chain and governs the rest of that chain from where it sits.** `#a.once().x().y()` runs both once ever; `#a.x().once().y()` runs `x` every time and `y` once. It never crosses `&&`: each receiver carries its own modifiers, so `#a.once().x() && #b.y()` runs `#b.y()` every time the first half runs. `debounce`/`throttle` are legal only right after the ref (a timer mid-chain is a parse error); `once` and `delay` may sit anywhere. `once()` must be followed by a call — `#a.x().once()` is a parse error, since a gate over nothing governs the next receiver instead. Modifiers stack and repeat freely — the parser has no duplicate check.
6. **`;` is independent, `.` is sequential and abortable, `&&`/`||` continue across receivers.** A `.` chain stops if a verb's event is `preventDefault()`-ed, if the verb threw, or if no implementation owns the verb. `&&` runs the next unit only if the previous one completed; `||` runs it only if the previous one was stopped by a guard's `preventDefault()`. An error or unowned verb stops both — `||` fires only on a guard abort. One phrase is all `&&` or all `||`; mixing is a parse error. Guards are verbs owned by an implementation that knows the rule; the grammar has no general comparison, by design.
7. **`once()` spends on passing through, not on completion.** The gate is about entry: the moment the walk reaches the `once` it is spent, and whether the rest of the chain then aborts, pauses or fails does not refund it. A spent gate cuts the chain where it sits — links before it still run, links after it never do.
8. **References are late-bound.** `#id`, `this` and reads resolve at fire time (after any debounce), never at parse time.
9. **One argument per verb.** A string signature takes one scalar (`set(5)`); a record signature takes one object literal (`setAttr({name: 'aria-expanded', value: 'true'})`); `"undefined"` takes none. Two bare arguments is a grammar error.
10. **Exactly three properties may be read off a ref** — `value`, `checked`, `valueAsNumber` — with the platform's own types, no coercion. `this.parentElement` and friends are not legal; relative navigation lives in implementation code.
11. **Selectors appear only inside string arguments** (`'.amount'`, `':scope > li'`). The grammar sees a string; the implementation's schema types it as a selector.
12. **Errors are local.** A missing `#id`, a grammar error, or an argument that fails the signature logs once and skips that phrase/link; the rest of the value runs.

### Reserved names

`debounce`, `throttle`, `once`, `delay` are modifiers — an implementation may not name a verb that way. `this` is the only keyword. `value`, `checked`, `valueAsNumber` are property reads, not verbs; an implementation may still define a verb called `value()` (distinguished by its parens).

### The formula

`modifiable-formula` is the second grammar an author meets on the same page as the trigger DSL, and it spells references the same way: the property is explicit, nothing is guessed from the tag.

```
reference := '#' id '.' ('value' | 'checked')
```

| Construct | Example | Meaning |
| --- | --- | --- |
| Reference | `#qty.value`, `#agree.checked` | `.value` reads the element's text — a number when it parses, else a string; an empty or missing value is `""`. `.checked` is the boolean `el.checked === true`, `false` on an element without one. A bare `#id` is a parse error: `reference #qty needs .value or .checked` |
| Typed `+` | `'invoice-' + #slug.value + '.pdf'` | Joins when either side is a string, adds otherwise, left to right: `'a' + 1 + 2` is `"a12"`, `1 + 2 + 'a'` is `"3a"`. `-`, `*`, `/`, unary `-` are always arithmetic; `min`/`max`/`floor`/`ceil`/`round`/`sum`/`count` return numbers |
| Boolean in arithmetic | `#item1.value * #item1.checked` | `true` is `1`, `false` is `0` — the line-item pattern: price when ticked, `0` when not |
| Arithmetic is strict | `#qty.value * #price.value` | `-`, `*`, `/`, unary `-`, and `+` between numbers require number or boolean operands. An empty or non-numeric operand is an error, written to the console and shown as `modifiable-invalid-value` — no `NaN`, no silent zero |

Sharp edge: two numeric-looking text inputs *add* — `#zip1.value + #zip2.value` sums them. Force a join with a literal on the left: `'' + #zip1.value + #zip2.value`.

Division by zero follows JavaScript: `1 / 0` is `Infinity`, `0 / 0` is `NaN`.

---

## The `interaction` event

The host wraps every verb call in its own event, dispatched at the receiver:

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

- **Non-bubbling.** A host receives interactions aimed at itself and nothing else — no `if (e.target !== el)` guards.
- **`preventDefault()` aborts the rest of the chain.** This is the guard-verb mechanism: `validate().send()`, with `||` as the failure branch.
- **Four return channels, because a DOM event has none.** `dispatchEvent` swallows listener exceptions and cannot tell "handled" from "nobody listened". So the host writes `handled` (an implementation owned the verb), `error` (validation or the verb body threw), `result` (the return value) and `pauseMs` (a verb paused the chain) onto the event, and the executor reads them after dispatch.
- **`pauseMs` defers the chain, it does not abort it.** The `delay(ms)` modifier — and any verb that sets `e.pauseMs = N` — stops the chain where it is, schedules the remainder to run N ms later, and returns. A re-fire that reaches the same pause reschedules it (latest wins); a re-fire gated before it — for example by a spent `once()` — leaves the pending remainder to run. Disconnecting the element drops it — the timer lives in the same per-element state as `debounce`.
- **No `isTrusted` gate.** Tests dispatch real DOM events on triggers.
- **The browser's `command` event plays no part.** A page can also use native invokers; an implementation may listen to `command` like any other DOM event.

---

## Hosts

One customized built-in per tag, defined with [`auto-wc`](https://github.com/AceCodePt/auto-wc) via `defineInteractableHost("input")` → `interactable-input`. The host does two independent jobs.

**Trigger side.** In `connectedCallback` it scans its `on-*` attributes and binds one listener per attribute on itself:

```ts
for (const name of this.getAttributeNames()) {
  if (!name.startsWith("on-")) continue;
  const type = name.slice(3);
  const handler = (ev: Event) => {
    if (!(ev instanceof ImplementationEvent) && isImplementationEvent(this, type)) return;
    runPhrases(this, this.getAttribute(name)!, ev);   // value read at event time
  };
  this.addEventListener(type, handler, { passive: true });                          // the DSL never cancels
  if (!isImplementationEvent(this, type)) {                                          // declared events never warn
    if (!(("on" + type) in this) && !LEGACY_EVENTS_WITHOUT_IDL.has(type))
      console.warn(`[Interactable] on-${type} on ${describe(this)}: <${this.localName}> has no "${type}" event; custom events are fine, but check the spelling and case`);
    warnIfNativeActionLikelyUnwanted(this, type);                                     // <form on-submit>, <a href on-click> without prevent-default
  }
  this._interactionCleanup.push(() => this.removeEventListener(type, handler));
}
```

A trigger is live the moment it connects. `disconnectedCallback` runs the cleanup list. The `on-*` **value** is read at event time, so editing `on-click="#a.show()"` to `"#b.show()"` takes effect on the next click. Adding a brand-new `on-*` attribute after connect requires re-inserting the element. Whether a name is an implementation event is also read at event time, from the element's current `implements` — not baked in when the listener binds.

**Receiver side.** Read `implements`; for each name, check the implementation's `tags` admits `this.localName`, instantiate the factory with `(this, attrs)`, wire the implementation's `on*` methods as listeners on itself, forward lifecycle callbacks, and route `onInteraction(e)` to the **first implementation in `implements` order** that declares `e.verb` — after validating `e.arg` against the verb's signature.

**Readiness.** Implementations attach synchronously in `connectedCallback`, so an interaction dispatched immediately after insertion is answered in the same task. An `implements` name the registry does not know yet is skipped, and the report is deferred one turn so the imports that follow can register it first; only a name still missing when the current script settles is reported with `console.error`. When it registers later, the registry dispatches `interactably:register` and every connected host re-runs its attach pass. Markup may therefore precede the imports. Config and state attributes are delivered through the class's `observedAttributes` snapshot plus one `MutationObserver` per element (an implementation can register after the host was defined), never for `on-*` — the four intersect attributes are the one exception, observed statically so the host can rebuild their observers when they change.

### Four kinds of element

| Kind | Has | Example |
| --- | --- | --- |
| **Self-contained** | `implements` | `<textarea is="interactable-textarea" implements="autogrowable">` — everything inside via the implementation's own `on*` handlers |
| **Trigger-only** | `on-*` | `<button is="interactable-button" on-click="#modal.show()">` — causes things elsewhere, never a receiver |
| **Receiver** | `implements` + `id` | `<dialog is="interactable-dialog" id="modal" implements="revealable">` — the id exists so others can address it |
| **Self-acting** | `implements` + `on-*` | `<input is="interactable-input" implements="modifiable" on-keydown="escape: this.reset()">` — triggers on itself |

The fourth kind is why `this` exists: `on-click="this.remove()"` works on every row cloned from a template, with no generated ids.

### Reporting

The host and executor report through `console.error` / `console.warn`; they do not throw (host methods run on the browser's stack, which owns their exceptions). `throw` is reserved for `defineImplementation` and the registry, where the exception reaches the developer who wrote the call.

- `console.error` when there is no legitimate reading: unknown `implements` name, tag outside the implementation's `tags`, receiver `#id` not in the document, verb no implementation owns, verb that threw, implementation that failed to attach.
- `console.warn` when the code may well be right but the author should look: `on-<type>` the element has no event for, `<form on-submit>` without `prevent-default`, a verb that returned a promise, `prevent-default` with nothing derived.

---

## The shipped implementations

| Implementation | Tags | Verbs | Config / state | What it does |
| --- | --- | --- | --- | --- |
| `modifiable` | input, textarea, output, select | `set`, `inc`, `dec`, `clear`, `reset`, `compute` | `step`, `formula`, `invalid-value` | typed writes with clamping; `set` takes a string or a number and `inc`/`dec` accept a number or a numeric string, throwing a named error when it cannot be read; evaluates a formula on `compute()` and on connect |
| `dirtyable` | input, textarea, select, output | `markClean` | — | toggles `.is-dirty` while `el.value` differs from the connect-time baseline |
| `formattable` | output, span, div, td, p, li, dd, b, strong, em, small | — | `format` | renders a number/date through `Intl` on display elements; keeps the raw text in `formattable-value`; formats on connect and on every library write |
| `listable` | ul, ol, tbody | `removeRow`, `adopt`, `clear` | `min-rows` | row removal / template adoption / clear, keeping `min-rows` |
| `requestable` | any | `send`, `abort` | `url`, `method`, `target`, `swap`, `include`, `concurrency` + `status` state; events `response`, `request-error` | fetch, swap the response into the DOM, fire `response` / `request-error` events |
| `attributable` | any | `setAttr`, `toggleAttr`, `removeAttr` | — | attribute writes (`setAttr({name, value})`) |
| `logger` | any | `log` | — | `console.log` from a phrase |
| `validatable` | form, input, select, textarea | `validate` | — | guard verb: `reportValidity()`, `preventDefault()` on failure |
| `no-propagate` | any | — | `events` (default `"click"`) | `stopPropagation` on listed events |
| `prevent-default` | any | — | `events` (derived, see below) | `preventDefault` on listed events |
| `revealable` | any | `show`, `toggle` | `modal` + `open` state | strategies per element ([below](#revealable)) |
| `auto-grow` | textarea | — | — | auto-height textarea |
| `storable` | input, select, textarea | `save`, `load`, `clear` | `scope` (`local`/`session`), `key` | persist a field's value to storage; restores on connect and fires `change` |
| `paste-transform` | input, textarea | — | `patterns`, `replaces` | rewrite pasted text with regexes |
| `copyable` | button | `copy` | `copied` state; event `copy` | copies a target element's text to the clipboard; sets `data-copied` and fires `copy` on success |
| `json-template` | any | — | `for`, `slice` | render a JSON data source through a child `<template>` |
| `hashable` | any | `hash` | — | writes `#<id>` into the location hash with `replaceState` (no history entry); no-op when already set, warns once without an id |

### The pause mechanism

`delay` is a phrase modifier, not a verb — it pauses the chain where it sits, and everything downstream, including past `&&`, waits, because `&&` is sequential:

```html
<button is="interactable-button" implements="attributable"
        on-click="this.delay(300).setAttr({name: 'aria-busy', value: 'true'})">…</button>
```

The executor stops the chain at `delay(ms)`, schedules the remainder to run `ms` later, and returns. A re-fire that reaches the same delay reschedules it (latest wins); a re-fire gated before it — for example by a spent `once()` — leaves the pending remainder to run. The timer is keyed per element and dropped on disconnect. The copy-flash pattern is unchanged: `this.copy(#snippet).delay(1500).removeAttr('data-copied')` marks the button, pauses, and the reset runs 1.5 s later. A pause is a scheduling decision the executor owns — never an awaited interaction.

### `prevent-default` and `no-propagate`

The executor never calls `preventDefault()` or `stopPropagation()` (every `on-*` listener is passive). Both facts are said on the element, by name — they are implementations, not grammar.

```html
<form is="interactable-form" implements="prevent-default no-propagate" no-propagate-events="submit"
      on-submit="#api.send(); #status.set('Saving…')">                                  <!-- derived from on-submit: submit -->

<div is="interactable-div" implements="prevent-default" prevent-default-events="contextmenu"
     on-contextmenu="#menu.showAt(this)">                                                <!-- not derivable: stated -->

<input is="interactable-input" implements="prevent-default"
       on-keydown="enter: #search.run(this.value)">                                      <!-- derived from the keyed phrase: keydown:enter -->

<section is="interactable-section" implements="prevent-default no-propagate"
         prevent-default-events="dragover,drop" no-propagate-events="drop"
         on-drop="#uploads.accept(this)">                                                <!-- not derivable; dragover must be cancelled or drop never fires -->

<canvas is="interactable-canvas" implements="prevent-default" prevent-default-events="wheel"
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
| anything else | fallback | `data-open` | `data-open` |

Focus trapping, the top layer, light dismiss, `::backdrop` and Escape handling come with the first three for free; the fourth row is the only one that invents anything.

**Controllers are wired at connect.** When a panel with an `id` connects, `revealable` scans the `is="interactable-…"` hosts, parses each one's `on-*` values through the same cached `parse()` the executor uses, and for every host that *controls* the panel — `#id.toggle()`, `#id.show()`, or `#id.show(true)`; the literal `show(false)` is a side effect, not control, and non-literal arguments such as `show(this.checked)` are not control either — it appends the panel's id to the host's `aria-controls` (deduped, existing tokens preserved) and sets `aria-expanded` to the current state, skipped on radio and checkbox inputs where it is meaningless. The sync continues at fire time: every element whose `aria-controls` names the panel gets `aria-expanded` refreshed, and a bare trigger that declares none gets `aria-controls` added — unless the verb was `show(false)`, which only updates, never claims.

**Radio-derived exclusivity, no attribute.** A panel shown *from* an `<input type="radio">` closes the panels of that radio's siblings — the radios sharing its `name` and its form owner (`source.form`, else `document`). Each sibling's `on-*` phrases are parsed, and every panel the sibling controls, other than the one being opened, receives `show(false)` — dispatched with no interacting source, so nothing is written onto a source element; the closed panel's `aria-expanded` is still refreshed on its button controllers. The browser's radio group *is* the group: the package-manager example is three radios named `pm` plus a panel per section, nothing else. Checkbox and button sources close nothing.

### Hashable

`hashable` writes `#<id>` into the location hash — a record of where you are, not a command. `hash()` uses `history.replaceState`, so scrolling does not grow history; `replaceState` fires no `hashchange`, and nothing reads the hash back — that is `:target` and the browser's own navigation. An element without an `id` warns once and does nothing.

### Storable

`storable` persists a form field's value to storage through three verbs: `save()`, `load()` and `clear()`. Nothing is stored unless a phrase calls `save()` — saving is an act you can see in the markup. The storage key is `interactable:<storable-key ?? name ?? id>`, the default scope is `local`, and same-name checkboxes store as a list: `save()` on either writes the JSON array of every checked control sharing that `name` and form owner. A field with none of `storable-key`, `name` and `id` warns once on connect and stores nothing.

Restore waits for the document to finish parsing, so initial-load markup works regardless of element order — elements connected after parse (e.g. a swapped fragment) restore immediately and may hit the readiness-replay gap (`NotReadyError`), logged against that open-list item, not solved here. Restore fires a native `change`, so your `on-change` phrase runs on restore — that is the point: in the package-manager example `name="pm"` does two jobs (the browser's radio group and the storage key), so restoring the stored radio re-opens the section that radio controls. `load()` re-reads the stored value as a user action and fires `change` when it changes; `clear()` removes the key.

---

## Writing an implementation

One call declares the name, the tags it may attach to, the config and state it brings, its verb signatures, and the factory — and the factory is type-checked against the signatures.

```ts
import { defineImplementation, valueOf } from "interactably";

export const modifiable = defineImplementation("modifiable", {
  tags: ["input", "textarea", "output", "select"],
  config: { step: "number | undefined" },                // authored: modifiable-step, read-only
  // no min/max here: <input> already has them as el.min / el.max
  verbs: {
    set:   "string | number",
    inc:   "string | number | undefined",
    dec:   "string | number | undefined",
    clear: "undefined",
    reset: "undefined",
  },
}, (el, attrs) => {
  const write = (v: string | number) => {
    const text = String(v);
    if ("value" in el) { if (el.value === text) return; el.value = text; }
    else               { if (el.textContent === text) return; el.textContent = text; }
  };
  const bound = (k: "min" | "max") =>
    el instanceof HTMLInputElement && el[k] !== "" ? Number(el[k]) : undefined;
  const clamp = (n: number) =>
    Math.min(bound("max") ?? Infinity, Math.max(bound("min") ?? -Infinity, n));
  return {
    set:   (_e, v)                    => write(v),
    inc:   (_e, n = attrs.step ?? 1)  => write(clamp(valueOf(el) + n)),
    dec:   (_e, n = attrs.step ?? 1)  => write(clamp(valueOf(el) - n)),
    clear: ()                         => write(""),
    reset: ()                         => write(el.getAttribute("value") ?? ""),   // back to what the author wrote
  };
});
```

`defineImplementation(name, { tags?, config?, state?, verbs, events? }, factory)`:

| Field | Type | Meaning |
| --- | --- | --- |
| `name` | `string` | The `implements="…"` word |
| `tags` | `string[]` (optional) | Tags the implementation attaches to; types `el` via `HTMLElementTagNameMap`. Omitted = any tag (`el` is `HTMLElement`) |
| `config` | `Record<string, tsyntax-string>` | Authored input, read-only, stored as `<name>-<key>` (`modifiable-step`) |
| `state` | `Record<string, tsyntax-string>` | Invented live state, read/write, stored as `data-<key>` (`data-open`) |
| `verbs` | `Record<verb, Sig>` | Public surface. `Sig` is a tsyntax string, an element constructor, or a record of those |
| `events` | `string[]` (optional) | Events the implementation dispatches (`copy`, `response`, `request-error`); on the element, `on-<event>` fires only for the implementation's `ImplementationEvent` |
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
- **`state`** — live information the implementation holds because the platform holds nothing for it. Stored as `data-<key>`, read/write.

Most implementations declare no `state`: `dirtyable` compares `el.value` with a baseline in its closure, `revealable` on a `<dialog>` reads `el.open`, `modifiable` writes `el.value`. A `state` entry is the exception, and the smell to check is whether the platform already has the thing under another name.

### `attrs` is a typed proxy

Built once per instance by `bindAttributes(el, name, def)`. Each getter reads the attribute live and validates it through the same compiled signature verbs use:

- `config` keys are **getters only** — TypeScript rejects `attrs.step = 2` and the runtime proxy throws.
- `state` keys also have **setters** that write the `data-*` attribute (`undefined` removes it); that is the sanctioned way for a verb to mutate invented state. The attribute change then reaches `attributeChangedCallback`, which renders.
- `attrs.step` maps to `modifiable-step`, `attrs.open` maps to `data-open`; the body spells neither.

### Conventions

- **`on*` methods are event handlers** on the host element (auto-wc semantics; `auto-grow`'s `onInput` still works). **Every other method is a verb** and must appear in `verbs`.
- **Verbs receive `(e, arg)`.** `arg` is already validated against the signature. Inputs come from `arg`; `e.source` and `e.originalEvent` are *context*, not input — metadata about the trigger (`aria-expanded` on the button that opened a dialog), not what to act on.
- **Verbs are synchronous.** Do the work, return; the host stores the return value on `e.result`. A verb that returns a promise gets a console warning.
- **Lifecycle:** `connectedCallback`, `disconnectedCallback`, `attributeChangedCallback(name, old, new)` may be returned from the factory alongside the verbs.
- **Implementations never call verbs on other elements.** Work that completes later declares **its own events** (`copyable` declares `"copy"`; `requestable` declares `"response"` and `"request-error"`) and dispatches an `ImplementationEvent` when the moment arrives; the follow-up is a plain `on-<event>` trigger attribute on that element, so `this` in the continuation is the element that did the work.
- **Registering an implementation ensures its hosts.** The registry calls `defineInteractableHost(tag)` for every tag in `tags`; tag-less implementations ensure nothing. `defineInteractableHost` is idempotent, so two implementations sharing a tag share one host class.

---

## State: three tiers

A verb's job is to **mutate state**; the reaction (text, classes, ARIA, `hidden`) happens in `attributeChangedCallback` or in response to the platform's own events. Verbs do not render.

| Tier | What it is | Where it lives | Who writes it |
| --- | --- | --- | --- |
| **Authored** | What arrived in the markup: the server's answer, the reset baseline | Attributes: `value`, `min`, `checked`, and our `config` (`modifiable-step`) | The author / the server; implementations only read |
| **Live** | Current state, which may have diverged from authored | Properties where the platform has them (`el.value`, `el.checked`, `el.open`, popover state); `data-*` from our `state` where it does not | Verbs, the user, the platform |
| **Derived** | Presentation | Classes, ARIA, `textContent`, `hidden` | The render callback only |

The `value` attribute / `value` property pair is the canonical case: `el.value = "x"` does not touch the attribute, and that is not an inconsistency — the attribute is what the author wrote, the property is the current value. This is what makes SSR trivial: the server writes `value="42"`, the browser parses it into both tiers, hydration adds nothing.

```ts
// dirtyable — no attributes written; the baseline lives in the closure
(el) => {
  let baseline = el.value;                                 // what the field held when it connected (SSR'd value included)
  const render = () => el.classList.toggle("is-dirty", el.value !== baseline);
  render();
  return {
    onInput:   render,
    markClean: () => { baseline = el.value; render(); },
  };
}
```

```ts
// revealable on a plain panel — the one case with invented state
// state: { open: "boolean | undefined" } → data-open
(el, attrs) => ({
  show:   (_e, value) => { attrs.open = value === false ? undefined : true; },
  toggle: () => { attrs.open = attrs.open ? undefined : true; },
  attributeChangedCallback(name) { if (name === "data-open") el.hidden = !attrs.open; },   // renders
})
```

Rules:

- **Read the platform before inventing.** `value`, `checked`, `open` on `<details>`/`<dialog>`, popover state, `min`/`max`/`step`. A `state` entry exists only when none of these hold the thing.
- **`config` is read-only.** A verb that needs its own baseline keeps one in the closure, as `dirtyable`'s `markClean` does.
- **Invented live state is `data-*`** — one namespace, reflected as `el.dataset`, visible in the inspector. Writes go through `attrs`, reads in `attributeChangedCallback`.
- **Closure state** for transient internals (in-flight request, timers).
- **One reader for an element's value.** `readValue(el)` returns `formattable-value` when a `formattable` raw store is present, else `.value`, else `textContent` — a number when the text parses, else the string (an empty value stays the empty string). Every implementation reads a number through `valueOf(el) = toNumber(readValue(el))` (NaN → 0).

There is no store, no signals, no cross-element watching. The DOM is the store; ids are the addresses. Whoever changes B fires A.

---

## Dynamics

| Case | Answer |
| --- | --- |
| **Dynamic triggers** (rows cloned from a template) | Put `is="interactable-<tag>"` in the template. On Chrome and Firefox the clone upgrades synchronously on insertion; `on-click="this.remove()"` / `#list.removeRow(this)` works on every clone with no generated ids. On Safari, and when the auto-loader adds `is=` for you, the upgrade is deferred ([below](#upgrade-timing)) |
| **Dynamic receivers** (a row's own subtotal) | Receivers stay ids or `this`. Either address a stable ancestor and let the implementation find the relative element from `e.source` (`closest("li")`), or stamp ids in the template |
| **Dynamic data sources** (sum whatever inputs exist) | Formula with a selector: `#total implements="modifiable" modifiable-formula="sum('#list .amount:valid')"`, recomputed by `#total.compute()`. `sum(selector)` / `count(selector)` run `querySelectorAll` at fire time. `sum` is strict; filter blanks in the selector — `sum('#list .amount:valid')` (blank `required` inputs are `:invalid`), `sum('#list .amount:not(:placeholder-shown)')` (blank inputs carrying a `placeholder`, even `placeholder=" "`), `sum('#list .amount:checked')` sums only ticked checkboxes |
| **Change without interaction** (server swap, external mutation) | The implementation that performed the change fires its own event (`on-response="#count.compute()"`), a new synchronous chain with `this` bound to that element |

<a name="upgrade-timing"></a>**Upgrade timing is not uniform.** `is=` written in the markup (server-rendered or in a `<template>`) upgrades synchronously on insertion in Chrome and Firefox. Two paths are asynchronous:

- **The auto-loader** (`installAutoLoader()`). Customized built-ins only upgrade when `is` is present at *creation*, so the loader watches with a `MutationObserver`, then **replaces the node**: `createElement(tag, { is })`, copy attributes, move children. Between insertion and the swap the element has no listeners — a programmatic `.click()` in that gap is lost, focus is dropped, and JS references captured before the swap point at a detached node. `getElementById` and the DSL's late-bound `#id` are unaffected. It is the simplest way to write markup — no `is=` anywhere — at the cost of a document-wide observer and a microtask-late upgrade. Use it to start; switch to explicit `is=` for production.
- **Safari.** Needs the [`@ungap/custom-elements`](https://github.com/ungap/custom-elements) polyfill; even explicit `is=` upgrades a tick late there (it is itself a MutationObserver).

Consequence: the auto-loader is a supported convenience, but explicit `is=` is the faster, synchronous form — prefer it in templates and server output. If code inserts a trigger and drives it immediately, await `customElements.whenDefined()` plus a microtask — or drive the receiver directly with `dispatchInteraction`.

Selector rule: **selectors may appear in arguments, never as receivers.** The dispatch graph stays 1:1 — every interaction goes to one element with one `implements`, so completion, grep (`#pop.` finds every writer) and error rules stay exact.

---

## Parser and executor

There is no engine. Two pure functions, both called from the host.

### Pipeline

```
DOM event on the trigger (passive listener bound in connectedCallback)
  → parse(attributeValue)          cached by string → Phrase[] with unresolved refs
  → runPhrases(this, phrases, ev)
→ key filter
  → run the units in order (one unit, or all `&&` / all `||`)
      leading debounce/throttle first (timer keyed by element + attribute + phrase + unit)
      resolve the unit's receiver (#id → getElementById, this → the source); missing → console.error, stop the phrase
      for each link in order, modifiers where they sit:
          once() → spent when the walk passes it; a spent gate cuts the chain from there
          delay(ms) → pause the chain; the remainder runs ms later
          resolve arg (scalar, or object literal field by field) → dispatch InteractionEvent
            · host: find the implementation owning the verb → e.handled = true
            · host: validate arg against the signature, call the verb — both inside try/catch → e.error on throw
            · executor, after dispatch:  !e.handled → console.error "no implementation on <receiver> handles verb()", stop
                                          e.error    → console.error once with receiver and verb, stop
                                          e.defaultPrevented → stop the unit, quiet
          `&&`: next unit only if this one completed; `||`: next unit only if this one was guard-aborted
```

- **Nested triggers behave like nested `onclick`.** A click on a button inside a `<div on-click>` fires the button's phrase, then bubbles and fires the div's. No implicit innermost-wins; suppression is explicit via `no-propagate` on the inner element.
- **Timers and `once` state are keyed per element, per receiver-chain** (in a `WeakMap`) and cleared on disconnect via `clearPhraseState`.
- **Imperative path:** `runPhrases(el, "#pop.show()", someEvent)` is the one entry point, and its first argument is what `this` means — the trigger listener and every implementation-event handler call the same function.

### Parse cache and resolution

`parse` caches by attribute string; the cached value is an AST in which `#id`, `this` and reads are **tokens**, not elements or values. Resolution happens per fire, inside `runPhrases`; two identical rows share one parse and resolve to two different elements. `this` is resolved as `token === "this" ? source : document.getElementById(id)` — never rewritten into the attribute, never stamped into an id, never consulted from `event.currentTarget`.

**Argument validation is the receiver's job, not the parser's.** The parser knows every literal's kind from syntax (bare `5` is a number, `'5'` is a string, `#id` / `this` are elements). Scalars go through `parseValueAgainstDSL` against the slot's tsyntax string; resolved elements go through `instanceof` against the slot's constructor. The only runtime-typed values are reads, and they carry the platform's type: `this.value` is a string, `#qty.valueAsNumber` is a number, `#agree.checked` is a boolean. The system never coerces a read; a verb that wants both types widens its own signature — `modifiable`'s numeric verbs are declared `"string | number | undefined"` and parse the string themselves, throwing a named error when they cannot: `inc() could not read a number from "banana"`.

### Native default actions and propagation

The executor does neither. Every `on-*` listener is passive; a phrase describes what happens, not what the browser is allowed to do.

```html
<form is="interactable-form" implements="prevent-default" on-submit="#api.send()">          <!-- submit cancelled -->
<a    is="interactable-a"    href="/docs"                  on-click="#log.track('docs')">Docs</a>   <!-- navigates and tracks -->
<a    is="interactable-a"    href="#p" implements="prevent-default" on-click="#p.show()">…</a>   <!-- in-page action -->
<button is="interactable-button" implements="no-propagate" on-click="#list.removeRow(this)">×</button>  <!-- row's on-click untouched -->
```

`prevent-default` binds its own listeners with `passive: false`, so the executor has no list of non-passive events. Because cancellation is explicit, the forgetful case is caught where it is cheap: at connect, a host carrying `on-submit` on a `<form>` (or `on-click` on an `<a href>`, or `on-keydown` on a `<button>`) without `prevent-default` logs one `console.warn`. A pre-existing `defaultPrevented` does **not** suppress dispatch.

---

## Asynchrony

**Verbs are synchronous and chains never await.** This is the HTMX shape the library exists to reproduce: the client says what to send and where the answer goes; everything that takes time happens elsewhere. A `.` chain is a sequence of DOM mutations that runs to completion inside one task, before the browser paints. Work that finishes later belongs to an implementation that owns it — today `requestable` — and continues by dispatching an `ImplementationEvent` the author's `on-response` / `on-request-error` attributes turn into a new synchronous chain.

A chain can still be *paused* without awaiting: `delay(ms)` pauses the chain where it sits, and the executor runs the remainder of the chain `ms` later as its own scheduled step. That is the mechanism behind a "temporarily set attribute" — `copyable` marks `data-copied` on success and never clears it, so the *developer* decides whether the flash persists or disappears:

```html
<button is="interactable-button" implements="copyable attributable"
        on-click="this.copy(#snippet)"
        on-copy="this.delay(1500).removeAttr('data-copied')">
  <span class="copy-label">Copy</span><span class="copied-label">Copied</span>
</button>
```

`copy` fires its `copy` event on success (`this` is the button); `delay(1500)` pauses; `removeAttr('data-copied')` runs 1.5 s later and the label reverts. A re-copy during the pause cancels the pending remove and reschedules it, so the flash lasts 1.5 s *after the last* copy.

```html
<input is="interactable-input" id="q" on-input="#results.debounce(300).send()">

<ul is="interactable-ul" id="results" implements="requestable"
    requestable-url="/api/search" requestable-include="#q"
    on-response="#count.compute(); #status.show(false)"
    on-request-error="#status.show()"></ul>
<output is="interactable-output" id="count" implements="modifiable"
        modifiable-formula="count('#results > li')"></output>
```

The trigger's chain is one synchronous link: `send()` aborts the previous in-flight request for `#results`, starts a new one, and returns. When the response lands, `requestable` swaps its children and dispatches `new ImplementationEvent("response", { originalEvent: e.originalEvent })`; the element's own `on-response` attribute runs a second synchronous chain in which `this` is `#results`. The network gap sits between two chains and has a name and a place in the markup.

What this rules out, and why it is the right trade:

| Not possible | Because | Instead |
| --- | --- | --- |
| `#results.send().highlight()` — a link after the response | The chain would have to await, and every question about what happens while it waits (a second fire, a removed receiver, a swapped `#results`) needs an executor answer | `on-response="this.highlight()"` |
| A verb returning a promise | The host ignores the value and warns; the chain has already moved on | Start the work in the verb; consume it in the closure; dispatch your own `ImplementationEvent` |
| A guard that asks the server | A guard is a synchronous yes/no; a round trip is a request | `send()` with the check server-side, and `on-request-error` for the no |
| `once()` as a double-submit guard for a request | It spends when the walk passes it, before the request returns, so a failed request leaves a dead trigger | `requestable`'s concurrency policy, below |
| An interaction queued until an implementation arrives | A queued interaction is a chain that waits; the host would answer after `dispatchEvent` returned, to nobody | Implementations attach synchronously; a late registration re-runs the attach pass |
| A value comparison in the attribute (`is`, `if`, `==`) | The rule belongs to an implementation | `validatable`'s constraints, or write a verb |

**Concurrency policy belongs to the implementation that owns the I/O.** `requestable` derives it from the method, the way `revealable` derives its strategy from the tag: a GET is idempotent, so a new send aborts the previous one (**latest wins**); anything else may already have happened on the server, so a new send while one is in flight is refused (**first wins**). `requestable-concurrency="latest | first | all"` overrides. Under `all`, every send starts its own request; `abort()` cancels every request in flight. Because `send()` sets `aria-busy="true"` synchronously and clears it when the last in-flight request settles, `form[aria-busy="true"] button { pointer-events: none }` disables the trigger with no JavaScript.

**Continuations run only if the element is still connected.** A response that replaces the requestable element itself (`requestable-swap="outerHTML"`) disconnects its host; the `on-response` event is skipped. Cancellation is `AbortError`, which runs neither event and logs nothing.

---

## Full examples

Each example imports the CDN bundles from the package. The core bundle ships inside `interactably-core.js`; per-implementation bundles (`modifiable.js`, `dirtyable.js`, …) register their implementation into the core's registry on import, so importing them is the whole setup.

### Price calculator

```html
<script type="module">
  import "interactably/dist/cdn/modifiable.js";
  import "interactably/dist/cdn/dirtyable.js";
  import "interactably/dist/cdn/listable.js";
  import "interactably/dist/cdn/prevent-default.js";
  import { defineInteractableHost } from "interactably/dist/cdn/interactably-core.js";
  for (const tag of ["input", "output", "button", "ul"]) defineInteractableHost(tag);   // idempotent
</script>

<label>Qty
  <input is="interactable-input" id="qty" implements="modifiable dirtyable prevent-default"
         type="number" value="1" min="0" max="10"
         on-input="#preview.set(this.value)"
         on-keydown="escape: this.reset().markClean(); #preview.compute()">    <!-- prevent-default derives keydown:escape and cancels the browser's native revert -->
</label>
<button is="interactable-button" on-click="#qty.dec(); #preview.compute()">−</button>
<button is="interactable-button" on-click="#qty.inc(); #preview.compute()">+</button>
<button is="interactable-button" on-click="#qty.inc(5); #preview.compute()">+5</button>
<button is="interactable-button" on-click="#qty.reset().markClean(); #preview.compute()">Reset</button>
<!-- min/max are the input's own; modifiable reads el.min / el.max and declares nothing for them -->
<output is="interactable-output" id="preview" implements="modifiable" modifiable-formula="#qty.value">1</output>

<ul is="interactable-ul" id="list" implements="listable" listable-min-rows="1">
  <li>
    <input is="interactable-input" class="amount" type="number" on-input="#total.compute()">
    <button is="interactable-button" on-click="#list.removeRow(this); #total.compute()">×</button>
  </li>
</ul>
<button is="interactable-button" on-click="#list.adopt(#row-tpl)">Add row</button>
<template id="row-tpl"><li>…</li></template>
<output is="interactable-output" id="total" implements="modifiable formattable"
        modifiable-formula="sum('#list .amount')"
        formattable-format="{ style: 'currency', currency: 'USD' }">0</output>
```

Kinds present: `#qty` is self-acting (implementations + `on-*` + id because the buttons address it); the six buttons are trigger-only; `#preview`, `#list` and `#total` are receivers; the `<li>` is a plain element — the row is reached through `#list.removeRow(this)`, so it needs no implementation, no host and no id, and cloning it from `#row-tpl` produces nothing that has to be unique.

**`+5` trace.** The button's host bound `click` in `connectedCallback` → `parse("#qty.inc(5); #preview.compute()")` (cached) → `runPhrases(button, …, clickEvent)` → resolves `#qty` → dispatches `InteractionEvent{verb:"inc", arg:5, source: button}` at `#qty` → host validates `5` against `"string | number | undefined"` → `modifiable.inc` → `write(6)` (clamped by `max`) → the interaction event reaches `#qty`'s own `dirtyable` handler, which marks `is-dirty` → the second phrase resolves `#preview` → `#preview.compute()` re-evaluates `#qty.value` (6).

**`×` trace.** Phrase 1 resolves `#list`, arg `this` is the button → `removeRow(e, button)` finds the row via `closest(":scope > *")` → phrase 2 (independent) resolves `#total` → `compute()` re-evaluates `sum('#list .amount')` over the remaining inputs.

**`Add row` trace.** `#row-tpl` is a bare ref → resolved to the `<template>` → host checks `tpl instanceof HTMLTemplateElement` (the `adopt` slot) → `listable.adopt(e, tpl)` clones the content. Point it at a `<div>` and the host logs `expected HTMLTemplateElement, got HTMLDivElement` and aborts the chain; write `'#row-tpl'` in quotes and it is a string, rejected the same way.

### Order form — the asynchronous seam

```html
<form is="interactable-form" id="order" novalidate
      implements="prevent-default validatable requestable"
      requestable-url="/api/orders" requestable-method="post"
      requestable-target="#receipt"
      on-response="#receipt.show(); #alert.show(false)"
      on-request-error="#alert.show()"
      on-submit="this.validate().send() || #validate-alert.show()">
  <input name="qty" type="number" min="1" required>
  <button>Place order</button>
</form>

<section is="interactable-section" id="receipt" implements="revealable" hidden></section>
<div     is="interactable-div"     id="alert"   implements="revealable" hidden role="alert">Couldn't place the order.</div>
<div     is="interactable-div"     id="validate-alert" implements="revealable" hidden role="alert">Please check the quantity.</div>
```

The form is the receiver of both `validate()` and `send()` in the first unit; `||` switches to `#validate-alert` only when validation aborts. The form is the right receiver: it validates, sends, and knows how to serialise itself (`new FormData(el)`). The trigger is `on-submit`, not a click on the button, so Enter in the field and the button produce the same one event. `prevent-default` with no config derives `submit` from `<form>`.

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

- **Happy path.** `submit` → `validate` passes → `send` starts the POST (`data-status="loading"`, `aria-busy="true"`), returns. Chain complete, two dispatches, well under a frame. On 200, the response swaps into `#receipt`, then `#receipt.show(); #alert.show(false)` runs from `on-response`.
- **Validation fails.** Because of `novalidate` the `submit` event fires anyway; `reportValidity()` shows the browser's bubble and returns false, the verb calls `e.preventDefault()`, the executor stops before `send` and runs the `||` branch instead: `#validate-alert.show()`. Nothing logged, no request.
- **Double submit.** The second `submit` sees `inflight` and the POST policy is `first`, so `send` returns. The button was already inert from `form[aria-busy="true"] button { pointer-events: none }`.
- **Server 500.** `settle("error")`, `data-status="error"`, `on-request-error` runs `#alert.show()`. Values kept, button re-enabled, the user retries.
- **A verb throws.** The host catches, sets `e.error`, the executor logs once and stops that chain. `#alert.show(false)` is a separate `;` phrase and still runs — that is what `;` promises.
- **Nobody handles it.** `on-response="#receipt.show(); this.reset()"`: `reset` dispatches to the form, none of its implementations owns it, `handled` stays false, and the executor logs `no implementation on form#order handles reset()`. A typo (`sned()`) takes the same path.
- **Response replaces the form.** `requestable-swap="outerHTML"` with no `target`: the swap removes `#order`, its host disconnects, `el.isConnected` is false, `on-response` is skipped. The new form carries its own attributes and upgrades on insertion.

### Scroll-spy — synthetic triggers

```html
<script type="module">
  import "interactably/dist/cdn/attributable.js";
  import { defineInteractableHost } from "interactably/dist/cdn/interactably-core.js";
  for (const tag of ["section", "a"]) defineInteractableHost(tag);
</script>

<nav id="toc">
  <a id="toc-intro" is="interactable-a" implements="attributable" href="#intro">Intro</a>
  <a id="toc-guide" is="interactable-a" implements="attributable" href="#guide">Guide</a>
</nav>

<!-- each section lights its own link while it is on screen -->
<section is="interactable-section" id="sec-intro"
         on-intersect-enter="#toc-intro.setAttr({name: 'data-visible', value: ''})"
         on-intersect-leave="#toc-intro.removeAttr('data-visible')">…</section>
<section is="interactable-section" id="sec-guide"
         on-intersect-enter="#toc-guide.setAttr({name: 'data-visible', value: ''})"
         on-intersect-leave="#toc-guide.removeAttr('data-visible')">…</section>
```

`on-intersect-enter` fires when a section becomes intersecting and `on-intersect-leave` when it stops, so each section sets and clears its own link's `data-visible`; several links may be lit at once when several sections are visible — a true report, not a single current item. There is no hash: scrolling is not navigation, nobody chose the position, and the browser already restores scroll on reload. `on-intersect-half` and `on-intersect-full` remain crossing markers in either direction, where `once()` is the natural partner: the first half-in-view crossing is the only one that acts. A margin key narrows the window: `0px 0px -50% 0px` waits until the section is past the viewport's middle line, and each `;` phrase under one attribute observes its own margin, so `on-intersect-half="0px 0px -50% 0px: #a.mark(); 0px: #b.mark()"` is two observers on one attribute.

**Note.** `on-intersect-enter` no longer fires on leaving. It fires only when the element becomes intersecting; anyone relying on the old bidirectional `enter` should use `on-intersect-half` with a `0px` margin or the new `on-intersect-leave`.

---

## API reference

All from `interactably` (or `interactably/dist/cdn/interactably-core.js` for the core subset). `installAutoLoader` also ships as `interactably/dist/cdn/auto-loader.js`.

| Export | What it is |
| --- | --- |
| `defineImplementation(name, decl, factory)` | Declare an implementation ([§ Writing an implementation](#writing-an-implementation)) |
| `defineInteractableHost(tag)` | Define `interactable-<tag>`; idempotent, returns nothing |
| `installAutoLoader()` | Opt in to the auto-loader: watch the DOM and add `is=` to any element with `implements` or `on-*`; returns a dispose function ([§ Dynamics](#dynamics)) |
| `registerImplementation(def)` | Register a normalized definition (used by `defineImplementation`) |
| `getImplementationDef(name)` | Look up a registered definition |
| `runPhrases(el, value, ev)` | Run an attribute string against an element and a DOM event; the one entry point |
| `parse(value, eventName?)` | Parse an attribute string into phrases (cached by event name and value) |
| `dispatchInteraction(el, verb, arg?, opts?)` | Imperatively send a verb; throws on unhandled/error, returns `result` |
| `InteractionEvent` | The event class ([§ The interaction event](#the-interaction-event)) |
| `ImplementationEvent` | The event an implementation dispatches for a declared event (`copy`, `response`, `request-error`); a synthetic intersect event carries the observed margin as `key` |
| `isImplementationEvent(el, type)` | True when `type` is an intersect name or an event some implementation on `el` declares |
| `clearPhraseState(el)` | Drop timers / `once` / log state for an element |
| `syncIntersect(el)` / `teardownIntersect(el)` | Create / drop the element's `IntersectionObserver`s, one per `(threshold, rootMargin)` |
| `normaliseRootMargin(margin?)` | Normalise and validate a CSS root-margin string (`undefined`/empty → `"0px"`; throws otherwise) |
| `INTERSECT_THRESHOLDS` | The intersect name → threshold table (`intersect-enter` 0, `intersect-leave` 0, `intersect-half` 0.5, `intersect-full` 1) |
| `matchesKey(ev, name)` | The key matcher (`space` → `" "`, case-insensitive) used by keys and event lists |
| `compileSignature(sig)` | Compile a slot/record signature to a validator |
| `bindEvents(el, events, handler, opts?)` | Shared listener binder for `prevent-default` / `no-propagate` style implementations |
| `readValue(el)` | The element's value as text: `formattable-value` (the raw store) → `.value` → `textContent`, a number when the text parses else a string |
| `valueOf(el)` / `writeValue(el, v)` | Number read (`toNumber(readValue(el))`, NaN → 0) and write helpers |
| `NotReadyError` | Error set on `e.error` when a verb reaches a host that has never connected |
| Implementations | `modifiable`, `dirtyable`, `listable`, `requestable`, `attributable`, `logger`, `validatable`, `noPropagate`, `preventDefault`, `revealable`, `autoGrow`, `storable`, `pasteTransform`, `copyable`, `jsonTemplate`, `hashable`, `formattable` |

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
- **Triggers are hosts, not delegated.** One place decides anything about an element. Cost: `is=` on every trigger (or the auto-loader), and the Safari polyfill covers more elements.
- **`this` for the trigger** — the word inline handlers have bound to the element for thirty years.
- **Parse once, resolve per fire.** `#id` / `this` stay tokens in the cached AST; two identical rows share a parse and bind to different elements. Nothing is rewritten into the DOM.
- **Nested triggers bubble** like inline handlers; `no-propagate` on the inner element is the explicit opt-out, not an implicit rule the executor enforces with a `closest()` walk per event.
- **Signatures are tsyntax strings** — the same string is the TypeScript type and the runtime check, at 3.6 KB, with no second schema vocabulary. Elements are constructors because tsyntax's check is `typeof` and cannot tell a button from a template.
- **Declare only what you invent.** Platform attributes are read off the element, never declared; `config` is read-only authored input; invented live state is `data-*`.
- **Strategies are derived, not declared.** `revealable` picks its behavior from the element at connect instead of an author-written `strategy=` attribute.
- **Default actions and propagation are implementations**, not executor rules or phrase modifiers — they are event-scoped facts and live on the element where a reader finds them. Only the *which* is derived, never the *whether*.
- **Verbs are synchronous.** Every async question (second fire, removed receiver, `once` while pending, latest vs first) is a question only the implementation doing the work can answer. The network gap is a named attribute, not a disguised dot.
- **Pauses are modifiers, not verbs.** `delay` sits in the chain like `once` and pauses where it sits — `this.delay(300).setAttr(...)` reads forward, and everything downstream, including past `&&`, waits. The executor owns the pause timer exactly like the debounce timer, so a pause never becomes an awaited interaction.
- **Three return channels on the event.** `dispatchEvent` swallows listener exceptions and cannot tell "handled" from "nobody listened"; the host is the last frame that can catch, so it reports `handled` / `error` / `result` on the event.
- **Readiness is reported, never awaited.** A late-registered implementation re-runs every connected host's attach pass; markup may precede the imports.
- **Report with `console.error`/`warn`, throw only at definition time.** Host code runs on the browser's stack, which owns its exceptions.

---

## When not to use this library

**This is a push system, not a pull one.** An event on a trigger pushes a verb onto a named receiver, the DOM changes once, and the interaction is over — there is no subscription, no reactivity, and no derived state. Nothing watches a value and re-runs phrases when it changes.

The tabs example is the honest boundary case. Each radio's `on-change` pushes `show()` onto its panels, and the exclusivity closes the rest; "which tab is visible" is never stored — every switch rewrites the panels' visibility by hand. Adding a fourth section means editing all three radio phrases, because the push is the whole mechanism. That is the price of push: the wiring that replaces a state variable grows with the page.

When the behaviour you need *pulls* — a value kept in sync with other values, recomputed on change, reactive by construction — a reactive/data-flow framework is the right tool. The one async seam this library does own is `requestable`: the trigger pushes `send()`, and `on-response` / `on-request-error` continue from the element that did the work.

Input masks and format-as-you-type belong in a component library built on the same `is=` hosts: both are caret-dependent, and formatting under a caret is not declarative. So does a visible-formatted / hidden-raw `<input>` pair, which needs markup of its own to fake. `formattable` is the whole declarative share — display elements only, formatted on connect and on each library write.

---

## Not supported

Shadow DOM (events are non-composed; receivers are document ids) · modifier keys (`.ctrl`), `.self`, `.outside` (reserved as future postfix modifiers) · class receivers · property access beyond `value` / `checked` / `valueAsNumber` · dynamic `on-*` attribute *names* after connect · cross-element watching (`watch()` remains a possible opt-in verb on an implementation, not a mechanism of the system) · a per-trigger `preventDefault` opt-out · nested objects or arrays as arguments · variadic verbs · a template-literal type over a whole `on-*` value (possible, not needed for v1) · a CLI check that `is=` in markup matches the implementations' declared tags.

---

## Appendix: reference grammar

```
attribute := 'on-' event-type
value     := phrase (';' phrase)*
phrase    := [key ':'] unit (('&&' | '||') unit)*
unit      := ref ('.' (call | modifier))+
ref       := '#' id | 'this'
call      := verb '(' [arg | object] ')'
arg       := number | "'" string "'" | 'true' | 'false' | ref | read
read      := ref '.' ('value' | 'checked' | 'valueAsNumber')
object    := '{' field (',' field)* '}'
field     := name ':' arg
modifier  := 'debounce(' ms ')' | 'throttle(' ms ')' | 'once()' | 'delay(' ms ')'
```

Whitespace is insignificant outside string literals. `id` excludes whitespace, `,`, `;`, `.`, `(`, `)`. `name` is an identifier. `this` is a keyword; an element with `id="this"` is addressed as `#this`. A `unit` must contain at least one call; `debounce`/`throttle` are legal only before the first call, while `once`/`delay` may sit anywhere. `&&` and `||` are top-level unit separators, recognized only outside string literals and argument parens/braces; a phrase may use one of them, never both. Which of `arg` / `object` / nothing a call accepts is decided by the verb's signature, not by the grammar.

**Signature language** (values in `config`, `state` and `verbs`): a **slot** is either a tsyntax scalar DSL string (`string`, `number`, `bigint`, `boolean`, `undefined`, numeric and quoted literals, template literals, `|` unions) or an element constructor (`HTMLElement`, `HTMLTemplateElement`, …). A verb signature is one slot or a flat record of slots; an attribute signature is one string slot. A record key whose slot admits `undefined` may be omitted from the object literal; any other key is required.

---

## Appendix: alternatives considered

Questions a reader may ask, with the answer they got. Each is the decision the body summarizes; the long form was settled and set aside.

**Why not delegate `on-*` from a document-level engine, so triggers need no `is=`?** It buys "works before any script defines a host" and costs a supported-events list, an ancestor walk per event, a MutationObserver for non-passive listeners, a `register()` API, and an unknown-event error class. Binding in `connectedCallback` deletes all of it.

**Why re-read the `on-*` value at fire time instead of parsing once at connect?** Server swaps are a new node either way. They differ for in-place edits: re-reading makes the edit take effect on the next fire; parsing at connect makes the DOM lie unless per-element observers are added.

**Why `this.value` rather than a `$value` keyword?** `$value` had to be learned; `this.value` is already known by people and by models, it can read any ref (not just the trigger), and it drops the coercion `$value` needed. Why not general property access? Because that is an expression language, and every safety claim rests on there not being one.

**Why `this` rather than `$self` or `$source`?** `this` is the inline-handler word for exactly this element, needs no explanation, and works in both the receiver slot and the argument slot — one word replaces two.

**Why is there no key list, `enter, numpadenter: #f.send()`?** It is one phrase standing for two, and every per-phrase mechanism (does Enter spend `once()` for NumpadEnter? do debounce timers merge?) then has to pick an answer. `;` already writes two phrases.

**Why isn't an empty field zero?** Because zero is an answer and an empty field is the lack of one — a blank quantity multiplied into a total of `0` invents the answer. The library refuses to invent it: an empty or non-numeric operand is an error, written to the console and shown as `modifiable-invalid-value`, and the author filters blanks in the selector (`:valid`, `:not(:placeholder-shown)`) when a set is allowed to have gaps.

**Why is there no group receiver, `(#a, #b).show(false)`?** The chain aborts per receiver, so the group form is exactly `#a.show(false); #b.show(false)` with a second spelling and a bookkeeping key that has to survive `#b` being replaced in the DOM. A shorthand that needs a paragraph is not a shorthand.

**Why not innermost-wins when triggers nest?** It is a `closest()` walk per trigger per event, added solely to suppress the outer phrase in a rare case — and inline handlers fire inner and outer, so matching that is the least surprising default.

**Why not positional argument lists, `transform('upper', 2)`?** The binding between position and meaning lives in schema order, which nothing in HTML can see. One scalar or one object literal makes a signature change a loud parse error instead.

**Why not declare signatures inside the factory, `set: verb("string", fn)`?** One site, but the host must run the factory against a detached element at registration just to learn the verbs. A static `verbs` table is pure data: serialisable for tooling, checked against the factory in both directions by TypeScript.

**Why not `element` and `selector` as tsyntax keywords?** tsyntax validates keywords with `typeof`, which cannot distinguish a button from a template; an element slot needs `instanceof`. And nothing makes a string a selector except that an implementation feeds it to `querySelectorAll` — that is documented by the record key, not a type.

**Why doesn't `modifiable` declare `min` and `max`?** `<input>` already has them, typed, as `el.min` / `el.max`; `<textarea>` does not have them at all. A declaration lists what the implementation brings; platform attributes are read, not declared.

**Why not `data-dirty` on `dirtyable`?** Dirty is `el.value` against the baseline captured at connect, a comparison the implementation can make on demand; an attribute holding the result is a cache that can go stale.

**Why doesn't the executor cancel the native default for `<form on-submit>`?** A table in the executor is an implicit mechanism next to the explicit `no-propagate`, and it has to decide at event time, before debounce and before refs resolve — where it collides with late binding. Moving cancellation to `prevent-default` removes the decision rather than answering it.

**Why not `.prevent()` / `.native()` / `.stop()` as phrase modifiers?** `debounce` / `throttle` / `once` / `delay` are per receiver chain and legitimately so; an event has one default action and one propagation path, so a per-phrase flag needs a rule for phrases disagreeing about something that is not theirs. Event-scoped statements belong on the element.

**Why not extend the native Invoker Commands API?** Sharing the attribute and event with the browser forces a `--` prefix negotiation for custom verbs, a native-default deferral table, an `originalEvent`-presence convention, and a double-dispatch risk on `<dialog>`. An attribute and event the browser does not know about have none of these problems.

**Why not two repositories, engine and implementations?** The parser and executor are imported by the host and ship in the same bundle; a second repo is a second release cadence for one consumer.

**Why not autonomous wrapper elements instead of `is=`?** They would fix Safari's asynchronous upgrade at the price of form participation, native semantics and existing CSS on every element, for every engine.

**Why don't chains await a verb's promise?** Every question it raises (a second fire mid-flight, a removed receiver while awaiting, `once()` while pending, latest vs first) is answerable only by the implementation doing the work. Verbs are synchronous; the implementation dispatches its own `ImplementationEvent` when the work finishes.

**Why `handled` and `error` on the event rather than exceptions?** `dispatchEvent` swallows listener exceptions and returns normally. An async wrapper would fix throws by making every chain asynchronous; a direct method call would add a second dispatch path. Fields on the event fix both with no change to either.

**Why not a general `<name>-after` convention for every implementation?** The word is shared, the event is not: a request failing and an upload failing call for different follow-ups. Each implementation names the moments it exposes as events (`copy`, `response`, `request-error`); the phrase for each is a plain `on-<event>` trigger attribute, and only dispatch is shared.

**Why not queue an interaction until the lazily loaded implementation arrives?** A queue is a waiting chain, and the host would answer the event after `dispatchEvent` returned, when the executor had already read the channels. With implementations imported before the markup, the case never occurs.