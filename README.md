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

> **Full documentation:** the [extensive guide](https://acecodept.github.io/interactably/docs.html), the [live examples](https://acecodept.github.io/interactably/examples.html), and the [API reference](https://acecodept.github.io/interactably/reference.html).

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

| Bundle | Contents |
| --- | --- |
| `interactably-core.js` | parser, executor, event, attachment, registry. No implementations. |
| `modifiable.js`, `dirtyable.js`, `renderable.js`, … | one implementation per file, registering into the core's registry on import |

> **The participation rule.** An element is a participant — something `start()` attaches — when it has `implements`, any `on-*` attribute, or both. Implementations and interactions are independent: an element may have either, both, or neither. If nothing else addresses an element, it does not need an `id`. Adding a brand-new `implements` or `on-*` attribute to an element after insertion does not attach it; re-insert the element.

---

## The grammar in one screen

One attribute per interaction; the value is the phrase language:

```
attribute := 'on-' event-type [ '(' value-decl (',' value-decl)* ')' ]
value     := phrase (';' phrase)*
phrase    := [key ':'] unit (('&&' | '||') unit)*
unit      := ref ('.' (call | modifier))+
ref       := '#' id | 'this'
call      := verb '(' [arg | object] ')'
arg       := number | "'" string "'" | 'true' | 'false' | ref | read | name | expr
read      := ref '.' ('value' | 'checked' | 'min' | 'max' | 'step')
object    := '{' field (',' field)* '}'
field     := name ':' arg
value-decl:= name ':' (tsyntax-scalar | '`' literal '`')
expr      := <expression>  (see § Expressions)
modifier  := 'debounce(' ms ')' | 'throttle(' ms ')' | 'once()' | 'delay(' ms ')'
```

Whitespace is insignificant outside string literals. `id` excludes whitespace, `,`, `;`, `.`, `(`, `)`, `:`, `&`, `|`, `{`, `}`, `'`, `"`, `#`. `this` is the only keyword; an element with `id="this"` is addressed as `#this`. A `unit` must contain at least one call; `debounce`/`throttle` are legal only before the first call, at most one per unit, while `once`/`delay` may sit anywhere. `&&` and `||` are top-level unit separators, recognized only outside string literals and argument parens/braces; a phrase may use one of them, never both. `debounce`, `throttle`, `once`, `delay` are modifiers — `defineImplementation` throws if any of them is declared as a verb; `value`, `checked`, `min`, `max`, `step` are property reads, not verbs (a verb called `value()` is still legal, distinguished by its parens).

**An event may declare values on the attribute.** `on-<type>(<name>:<tsyntax-scalar>, …)` names the values the event carries, and each declared name resolves as an argument inside that phrase — a bare argument (`this.set(html)`) or an object-field value (`#list.render({body: html})`) — and nowhere else. It is written without spaces, because attribute names cannot contain whitespace; names are validated as flat tsyntax scalars at wire time. Coloned and bracketed attribute names trip HTML validators and need escaping in CSS selectors, but the runtime preserves them intact. A name the event does not declare is an error when the element is wired, not when the event fires; declared names never resolve inside formula expressions (`replace(html, …)` stays an error). The right-hand side may instead be a backticked literal to match, not a type to bind: ``on-keydown(code:`Escape`)`` runs the phrase only when the key's `code` is `Escape`. A declaration is all literals or all types, never mixed; every matching declaration fires, with no most-specific rule. (See [the docs](https://acecodept.github.io/interactably/docs.html#trigger-grammar) for the field allowlist, the key-versus-code trade, and how literals compare.)

| Construct | Example | Meaning |
| --- | --- | --- |
| Trigger | `on-click="#pop.show()"` | On `click`, run the phrase |
| Implementation event | `on-copy="#flash.show()"` | An implementation's own event (`copy-error`, `response`, `request-error`, `request-timeout`, `request-offline`, `restore`); copyable also re-dispatches the native `copy`, which shares the attribute |
| Synthetic trigger | ``on-intersect(state:`enter`)="#link.mark()"`` | `IntersectionObserver` against the viewport; `state` matches `enter`/`leave`, `full` matches `true`/`false`, and the four logical margin slots configure the observer |
| Receiver | `#pop.show()` | Send verb `show()` to the element with `id="pop"` |
| Self | `this.reset()` | The element the phrase was read from |
| Chain | `#pop.show().focus()` | `.show()` then `.focus()` on the same receiver, in order |
| Independent | `#pb.show(false); #pa.show()` | Two phrases that run regardless of each other |
| And | `#form.validate() && #hint.show()` | Next unit only if this one completed |
| Or | `#form.validate().send() \|\| #alert.show()` | Next unit only if a guard aborted this one |
| Scalar arg | `#qty.set(#qty.value + 5)` | Numbers, `'strings'`, `true` / `false` |
| Property read | `#preview.set(this.value)` | `value`/`checked`/`min`/`max`/`step`, typed by the element |
| Key | `on-keydown="enter: #f.send()"` | Filter *which* events reach the phrase |
| Object literal | `#note.transform({mode: 'upper', shift: 2})` | One named-argument object |
| Event value | `on-response(html:string)="#receipt.set(html)"` | The event's own value, declared on the attribute and resolved by name inside that phrase |
| Debounce | `#echo.debounce(300).set(this.value)` | Defers this receiver's chain; a re-fire restarts the timer |
| Throttle | `#viewport.throttle(16).zoom(this)` | Leading-edge throttle of this receiver's chain |
| Once | `#tour.once().show()` | Gates the rest of the chain; spent when the walk passes it |
| Delay | `#note.delay(500).reset()` | Pauses the chain where it sits for a fixed ms |
| Expression | `#total.set(sum('#list .amount'))` | An argument that is not a literal, ref or read evaluates at fire time |

The rules, one line each:

1. **Parens are mandatory.** `#pop.show` is a CSS selector; `#pop.show()` is a call.
2. **Receivers are `#id` or `this`.** Ids may not contain `.`, `:`, `&`, `|`, `{`, `}`, `'`, `"` or `#`. Class or attribute selectors are never receivers.
3. **One receiver per unit.** A `.` chain stays on one receiver; `&&`/`||` units may each name a different one. There is no group form.
4. **Keys are legal only under `on-keydown`/`on-keyup` and a keyed implementation event**, one per phrase; two keyboard keys is two phrases. Key names match `KeyboardEvent.key` case-insensitively; `space` means `" "`. `intersect` is not keyed: its `state`, `full` and margin slots live in the attribute name.
5. **A modifier is a step in a receiver's chain and governs the rest of that chain from where it sits.** It never crosses `&&`. `debounce`/`throttle` are legal only right after the ref; `once` and `delay` may sit anywhere. `once()` must be followed by a call. At most one `debounce`/`throttle` per receiver chain.
6. **`;` is independent, `.` is sequential and abortable, `&&`/`||` continue across receivers.** A `.` chain stops on a `preventDefault()`-ed event, a throw, or an unowned verb. `||` fires only on a guard's abort; errors and unowned verbs stop both.
7. **`once()` spends on passing through, not on completion.** A spent gate cuts the chain where it sits — links before it still run, links after it never do.
8. **References are late-bound.** `#id`, `this` and reads resolve at fire time (after any debounce), never at parse time.
9. **One argument per verb.** A string signature takes one scalar; a record signature takes one object literal; `"undefined"` takes none. Two bare arguments is a grammar error.
10. **Five properties may be read off a ref** — `value`, `checked`, `min`, `max`, `step` — plus `height`/`width` inside expressions; each with the type the element declares, no coercion.
11. **Selectors appear only inside string arguments** (`'.amount'`, `':scope > li'`). The grammar sees a string; the implementation's schema types it as a selector.
12. **Errors are local.** A missing `#id`, a grammar error, or an argument that fails the signature logs once and skips that phrase/link; the rest of the value runs.

`<event-type>` is any DOM event type; the listener is bound on the element itself, so there is no supported-events list. Triggers are three kinds: **native DOM events**, **implementation events**, and **synthetic triggers**. Default actions and propagation are implementations, not grammar — [§ prevent-default and no-propagate](https://acecodept.github.io/interactably/docs.html#prevent-default). Arguments may be expressions — see [Expressions](https://acecodept.github.io/interactably/docs.html#expressions) in the docs.

---

## The shipped implementations

| Implementation | Tags | Verbs | Config / state | What it does |
| --- | --- | --- | --- | --- |
| `modifiable` | input, textarea, output, select | `set`, `clear`, `reset` | — | typed writes; `set` takes a string, a number, or an expression evaluated at fire time |
| `dirtyable` | input, textarea, select, output | — | `dirty-on`; events `dirty`, `clean` | compares the element's current value with its platform default (`defaultValue`, `defaultChecked`, `defaultSelected`); fires `dirty` / `clean` on transition; writes nothing |
| `formattable` | output, span, div, td, p, li, dd, b, strong, em, small | — | `format` | renders a number/date through `Intl` on display elements; keeps the raw text in `formattable-value`; formats on connect and on every library write |
| `renderable` | any | `render`, `undo` | `disable-view-transition`; event `rendered` | stamps a template with flat scalar slots into text and attributes, or inserts a `payload` markup string as-is (the two are mutually exclusive — a signature error to supply both); every successful swap animates as a same-document view transition and fires `rendered` when it settles; `undo` reverses the one last render |
| `requestable` | any | `send({method, url})`, `abort` | `url`, `method`, `include`, `concurrency`, `timeout` + `status` state; events `response`, `request-error`, `request-timeout`, `request-offline` | fetch and announce; never touches the DOM — `response` carries the response body text as `html` and the `status`, and the author places it (`on-response(html:string)="#list.render({payload: html, swap: 'beforeend'})"`); failures split three ways — `request-error` (non-ok status, filter by status literal), `request-timeout`, `request-offline` |
| `attributable` | any | `setAttr`, `toggleAttr`, `removeAttr` | — | attribute writes (`setAttr({name, value})`) |
| `classable` | any | `add`, `remove`, `toggle` | — | `classList` writes, one class name per call; `toggle` has no force argument — `add`/`remove` are the forced forms |
| `logger` | any | `log` | — | `console.log` from a phrase |
| `validatable` | form, input, select, textarea | `validate` | — | guard verb: `reportValidity()`, `preventDefault()` on failure |
| `no-propagate` | any | — | `events` (default `"click"`) | `stopPropagation` on listed events |
| `prevent-default` | any | — | `events` (derived: the element's `on-submit`/`on-click`/keyed `on-keydown`, else submit on a form, click on a[href]/button) | `preventDefault` on listed events |
| `revealable` | any | `show`, `toggle` | `modal` + `open` state | strategies per element ([§ revealable](https://acecodept.github.io/interactably/docs.html#revealable)) |
| `auto-grow` | textarea | — | — | auto-height textarea; sizes on connect and on `input`/`change`; a value written by script is sized on the next input |
| `storable` | any | `save`, `restore`, `clear` | `scope` (`local`/`session`), `key`, `value` | persists a declared slot under a declared key — a literal, or a ref (`#cart`/`this` for contents, `this.value` for a property); `restore()` reads the key and fires `restore` carrying the stored string as the declared value `value`, writing nothing; `on-restore(value:string)` resolves it by name and restore never filters |
| `pastable` | input, textarea | — | — | fires `pasted` after a paste has landed, carrying the post-paste value as `text`, so `this.value` is the new value |
| `copyable` | pre, code, p, div | `copy` (no argument) | events `copy`, `copy-error` | copies the element's own text to the clipboard — a button calls it as a plain receiver (`#snippet.copy()`); on success it dispatches `copy`, which shares the attribute with the native clipboard copy, on total failure `copy-error`; empty text is a no-op; the flash is the author's (`on-copy`) |
| `focusable` | any | `focus`, `blur` | — | `HTMLElement.focus()` / `blur()` as verbs; reports once if focus did not take |

`attributable` writes attributes whole. `class` is a token list, so `classable` exposes `classList` instead — `#menu.toggle('open')`, one name per call, browser rules for what a name may be.

Details, strategies and worked examples live in the [reference](https://acecodept.github.io/interactably/reference.html) and [docs](https://acecodept.github.io/interactably/docs.html) pages.

---

## Why it is built this way

The five load-bearing claims; the full argument for each is settled in the [docs](https://acecodept.github.io/interactably/docs.html).

- **No engine, one observer.** A pure parser turns attribute strings into phrases; an executor runs them. One document-level `MutationObserver` (`start()`) decides what participates and when.
- **Native elements.** No `is=`, no shadow DOM, no wrapper elements. Platform attributes are read off the element, never declared; `<dialog>` traps focus, `<details>` toggles, forms submit.
- **Push, not state.** The DOM is the store; ids are the addresses. No subscription, no reactivity, no derived state — an event pushes a verb onto a named receiver.
- **Signatures as strings.** Every verb signature is a tsyntax string: the same string is the TypeScript type at the call site and the runtime check.
- **The asynchronous seam.** Verbs are synchronous and chains never await; the implementation that owns the I/O dispatches its own event (`on-response` / `on-request-error` / `on-request-timeout` / `on-request-offline`) when the work finishes.

---

## When not to use this library

**This is a push system, not a pull one.** An event on a trigger pushes a verb onto a named receiver, the DOM changes once, and the interaction is over — there is no subscription, no reactivity, and no derived state. Nothing watches a value and re-runs phrases when it changes.

The tabs example is the honest boundary case. Each button's `on-click` pushes `show()` onto its panels, and the six it closes; "which tab is visible" is never stored — every switch rewrites the panels' visibility by hand. Adding a fourth section means editing every phrase, because the push is the whole mechanism. That is the price of push: the wiring that replaces a state variable grows with the page.

When the behaviour you need *pulls* — a value kept in sync with other values, recomputed on change, reactive by construction — a reactive/data-flow framework is the right tool. The one async seam this library does own is `requestable`: the trigger pushes `send()`, and `on-response` / `on-request-error` / `on-request-timeout` / `on-request-offline` continue from the element that did the work.

Input masks and format-as-you-type belong in a component library built on the same elements: both are caret-dependent, and formatting under a caret is not declarative. So does a visible-formatted / hidden-raw `<input>` pair, which needs markup of its own to fake. `formattable` is the whole declarative share — display elements only, formatted on connect and on each library write.

---

## Not supported

Shadow DOM (events are non-composed; receivers are document ids) · modifier keys (`.ctrl`), `.self`, `.outside` (reserved as future postfix modifiers) · class receivers · property access beyond `value` / `checked` / `min` / `max` / `step` (and `height` / `width` in expressions) · attaching an element that gains `implements` or an `on-*` attribute after insertion (re-insert it) · a per-trigger `preventDefault` opt-out · nested objects or arrays as arguments · variadic verbs · renderable slots are flat scalars only — `{name}` placeholders in text nodes and attribute values, substituted as strings, no nested objects or arrays as slot values · the native paste event (`on-paste` is not a trigger; `on-pasted` fires after the insertion) · a template-literal type over a whole `on-*` value (possible, not needed for v1).

`on-load` always means attach, including on `<img>`, `<iframe>`, `<body>`, `<link>`, `<script>`; it is never the native `load` event — bytes-arrived is `addEventListener('load', …)`.

---

## API reference

All from `interactably` (or `interactably/dist/cdn/interactably-core.js` for the core subset).

| Export | What it is |
| --- | --- |
| `defineImplementation(name, decl, factory)` | Declare an implementation ([§ Writing an implementation](https://acecodept.github.io/interactably/docs.html#writing-an-implementation)) |
| `start(root = document)` | Attach every participant under root and watch it for insertions and removals; idempotent per root; returns a dispose function. Defers the initial scan to `DOMContentLoaded` when called during parse ([§ Attachment](https://acecodept.github.io/interactably/docs.html#attachment)) |
| `registerImplementation(def)` | Register a normalized definition (used by `defineImplementation`). Throws if the name is already registered — the realistic cause is two copies of a behaviour in one page (a CDN bundle plus a re-export); dev-server HMR without a page reload is not supported |
| `getImplementationDef(name)` | Look up a registered definition |
| `runPhrases(el, value, ev)` | Run an attribute string against an element and a DOM event; the one entry point |
| `parse(value, eventName?)` | Parse an attribute string into phrases (cached by event name and value) |
| `dispatchInteraction(el, verb, arg?, opts?)` | Imperatively send a verb; throws on unhandled/error, returns `result` |
| `InteractionEvent` | The event class ([§ The interaction event](https://acecodept.github.io/interactably/docs.html#interaction-event)) |
| `ImplementationEvent` | The event an implementation dispatches for a declared event (`copy`, `response`, `request-error`, `request-timeout`, `request-offline`, `restore`), and the event `intersect` carries `state` (`enter`/`leave`) and/or `full` (`true`/`false`) as declared values `values`; an event may also carry a routing `key` (`response` → `html` and `status`, `request-error` → `status`, `pasted` → `text`, `restore` → `value`) |
| `isImplementationEvent(el, type)` | True when `type` is the intersect event or an event some implementation on `el` declares |
| `clearPhraseState(el)` | Drop timers / `once` / log state for an element |
| `syncIntersect(el)` / `teardownIntersect(el)` | Create / drop the element's `IntersectionObserver`s, one per resolved `rootMargin` |
| `normaliseRootMargin(token?)` | Validate one root-margin token: a `px`/`%` length or a `#id.height`/`#id.width` reference (`undefined`/empty → `"0px"`; throws otherwise) |
| `readMeasured(el, dim)` | The element's border-box `height`/`width` in CSS pixels as of the last layout the browser reported — the cache behind `#id.height`/`#id.width` |
| `INTERSECT_EVENT_NAMES` | The synthetic intersect event name (`intersect`) |
| `matchesKey(ev, name)` | The key matcher (`space` → `" "`, case-insensitive) used by keys and event lists |
| `compileSignature(sig)` | Compile a slot/record signature to a validator |
| `optionalCtor(Ctor)` | Mark an element-constructor signature slot optional: the key may be omitted, and a present value is instance-checked (`render`'s `template` field) |
| `exclusive(other, slot)` | Mark a record-signature field as mutually exclusive with another named field: supplying both is a signature error before anything runs; the partner name is checked when the signature compiles (`render`'s `payload` is `exclusive("template", "string | undefined")`) |
| `bindEvents(el, events, handler, opts?)` | Shared listener binder for `prevent-default` / `no-propagate` style implementations |
| `readValue(el, property = "value")` | The element's value with the type its declaration decides: number/range read a number, checkbox/radio read their checked boolean, other inputs/textarea/select read `.value` (a string), display elements read `formattable-value` as a number under a numeric format, else `textContent` (a string); `readValue(el, "checked")` is the checked boolean; `readValue(el, "min" | "max" | "step")` is the platform bound — a number on number/range inputs (absent `min`/`max` is `""`, absent `step` is `1`), the string as written elsewhere |
| `writeValue(el, v)` | Write helper: sets `.value` where the element has one, else `textContent` |
| `NotReadyError` | Error set on `e.error` when a dispatch reaches an attached element whose `implements` names an implementation that has not registered yet |
| Implementations | `modifiable`, `dirtyable`, `renderable`, `requestable`, `attributable`, `classable`, `logger`, `validatable`, `noPropagate`, `preventDefault`, `revealable`, `autoGrow`, `storable`, `pastable`, `copyable`, `formattable`, `focusable` |

---

## Documentation

- **[docs.html](https://acecodept.github.io/interactably/docs.html)** — the design document: the grammar, the host, the state model, the parser and executor, the shipped implementations, and the appendices.
- **[examples.html](https://acecodept.github.io/interactably/examples.html)** — the working proof: every example is live plain HTML you can click and copy.
- **[reference.html](https://acecodept.github.io/interactably/reference.html)** — the implementation catalogue and the public API, for lookup.

The site is the design document; this file is the package entry point and the summary of it. It must never be the only place a fact lives.