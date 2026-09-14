# Interactably: a trigger grammar and host for customized built-in web components

Alternatives that were weighed and rejected while arriving at this design are collected in Appendix C, as questions and answers, so the body describes one design.

---

## 1. Summary

Interactably is a declarative interaction language for customized built-in web components, plus the host that runs it. An element with `is="interactable-<tag>"` does one or both of two jobs: it **triggers** interactions and it **receives** them.

A trigger carries one attribute per interaction:

```html
<button is="interactable-button" on-click="#modal.show()">Open</button>
<dialog is="interactable-dialog" id="modal" implements="revealable">…</dialog>
```

- **Triggers** carry `on-<event>` attributes whose value is a tiny, parseable DSL: `#id.verb(arg)`. The host reads its own `on-*` attributes on connect and binds one listener per attribute on itself.
- **Receivers** `implements` one or more *implementations*. An implementation's public surface is its **verbs**. The host routes an incoming `interaction` event to the implementation that owns the verb.
- **Every participating element is a host** (`is="interactable-<tag>"`), whether it triggers, receives, or both. The host binds the trigger listeners, instantiates implementations, and routes interactions between them.
- **The library dispatches its own `interaction` event.** The browser's native `command` attribute and `command` event play no part in it (§4, §10.1).
- **There is no engine.** A pure parser turns attribute strings into phrases; an executor runs phrases against a source element and a DOM event. Both are functions the host calls; nothing runs on its own at document level.

---

## 2. Terminology

| Term | Meaning |
| --- | --- |
| **host** | A customized built-in, `is="interactable-<tag>"`, that binds trigger listeners, instantiates implementations, and routes interactions. Whether an element carries one is decided by the `is=` rule (§5.2) |
| **implementation** | A named, `-able`-adjective capability (`revealable`, `modifiable`, `dirtyable`) declared with `defineImplementation`. An element may `implements="revealable loggable"`, space-separated, like `class` |
| **trigger** | An element with at least one `on-*` attribute |
| **receiver** | The element a verb is sent to: the `#id` (or `this`) that follows the dot |
| **verb** | The public surface of an implementation; an imperative, called with parens: `show()`, `set(5)`, `removeRow(this)` |
| `on-<event>="#id.verb(arg)"` | One attribute per interaction; `on-<event>` names the DOM event, the value is the trigger grammar (§3) |
| `interaction` event | The library's own event, dispatched by the host to the receiver: non-bubbling, cancelable, with `verb`, `arg`, `source` and `originalEvent` on it (§4) |
| **phrase** | One `ref (.call)+ (.modifier)*` unit: a single receiver plus a chain of calls. A `;`-separated value holds several phrases |
| **chain** | The `.`-separated calls in one phrase, run in order, synchronously, abortable |
| **modifier** | `.debounce(ms)` / `.throttle(ms)` / `.once()`; trails the phrase and applies to the whole of it |
| **parser** | The pure function that turns an attribute string into phrases; `#id`, `this` and property reads stay tokens until fire time |
| **executor** | The pure function that runs phrases against a source element and a DOM event: resolves refs, applies modifiers, dispatches, and reads the result channels |
| **config** | Authored input an implementation declares; stored as `<name>-<key>` attributes (`modifiable-step`), read-only |
| **state** | Live information an implementation invents because the platform holds nothing for it; stored as `data-<key>`, read/write |
| `defineImplementation(name, { tags?, config?, state?, verbs }, factory)` | One declaration site; `tags` types `el`; factory receives `(el, attrs)` (§5.3) |

---

## 3. The trigger grammar

### 3.1 Attribute

```
on-<event-type>
```

`<event-type>` is any DOM event type: `on-click`, `on-input`, `on-change`, `on-keydown`, `on-mouseenter`, `on-submit`, `on-toggle`, `on-wheel`, … The listener is bound on the element itself, so bubbling and capture are irrelevant and there is no supported-events list. One attribute per interaction; an element may carry several.

There are **no default interactions**. Every trigger names its event.

Because any name after `on-` becomes a listener, a misspelled type (`on-clcik`) is not a grammar error; it is a listener that never fires. The host therefore checks each type against the element itself at bind time: if `("on" + type) in this` is false and the type is not in `LEGACY_EVENTS_WITHOUT_IDL` (`registry/interactable/events.ts`), it warns: `on-clcik on button#save: <button> has no "clcik" event; custom events are fine, but check the spelling and case`. Every event the platform has shipped in the last decade has an `on<type>` IDL attribute on the elements that can fire it, so the check is derived from the browser rather than from a list this project maintains: it is correct for `scrollend`, `beforetoggle` and `command` the day they ship, and it catches case errors (`on-Click`) because event types are case-sensitive. The exceptions list holds the handful of older events without an IDL attribute (`compositionstart`, `compositionupdate`, `compositionend`, `DOMContentLoaded`, …). It is closed by construction, nothing new is added to the platform without an IDL attribute, so it is written once and never grows, which is the only kind of event list this design keeps. A full list of platform events was rejected for the opposite reason: it is stale for new events, and new events are the ones early adopters use. The check is a warning, not an error, because the set of event types is open: `on-cart-updated` is a legitimate listener for an event an implementation dispatches, and the platform has no closed list either. Nothing is gated by it.

### 3.2 Value

```
value     := phrase (';' phrase)*
phrase    := [key ':'] ref ('.' call)+ ('.' modifier)*
ref       := '#'id | this
call      := verb '(' [arg | object] ')'
arg       := number | 'string' | true | false | ref | read
read      := ref '.' ('value' | 'checked' | 'valueAsNumber')
object    := '{' name ':' arg (',' name ':' arg)* '}'
modifier  := debounce(ms) | throttle(ms) | once()
```

```html
<button on-click="#pop.show().focus()">
<input  on-input="#echo.set(this.value); #results.filter(this.value).debounce(300)">
<input  on-keydown="escape: this.reset(); enter: #form.validate().send()">
<button on-click="#tour.show().once()">
<button on-click="#pb.hide(); #pc.hide(); #pa.show()">
<input  on-input="#total.compute()">
<output id="total" implements="modifiable" modifiable-formula="format(sum('#list .amount'), { style: 'currency', currency: 'USD' })">
<button on-click="#list.removeRow(this)">
<button on-click="#note.transform({mode: 'upper', shift: 2})">
```

### 3.3 Rules

1. **Parens are mandatory on every verb.** `#pop.show` is a CSS selector; `#pop.show()` is a call. This is what lets the tokenizer work with no lookahead.
2. **Receivers are ids or `this`.** Ids may not contain `.`. Class or attribute selectors are never receivers (§7, §10.9).
3. **One receiver per phrase.** To act on two elements, write two phrases: `#a.hide(); #b.hide()`. There is no group form: `(#a, #b).hide()` and `#a, #b.hide()` are both grammar errors, not broadcasts (§10.8).
4. **Keys are legal only under `on-keydown` / `on-keyup`, one per phrase.** A key prefix filters *which events* reach the phrase. Two keys are two phrases: `enter: #f.send(); numpadenter: #f.send()`. A comma-separated key list is a grammar error, not a union (Appendix C). Names match `KeyboardEvent.key` case-insensitively; `space` means `" "`.
5. **Modifiers trail and apply to the whole phrase.** A modifier followed by a verb is an error. Written order is irrelevant; the executor normalizes to: key filter → throttle/debounce → chain → once.
6. **`;` is independent, `.` is sequential.** Phrases separated by `;` run regardless of each other. Links in a `.` chain run in order, synchronously, and **abort** if a verb's `interaction` event is `preventDefault()`-ed, if the verb threw, or if no implementation on the receiver owns the verb. Verbs are synchronous (§8.6); a chain never awaits.
7. **`once()` is consumed on chain completion**, not on start. A chain stopped by a guard, an error or an unowned verb leaves the phrase live. Because chains are synchronous, "completion" is unambiguous: the phrase is spent before the DOM listener that fired it returns. Since a phrase has exactly one receiver, there is nothing else to track.
8. **References are late-bound.** `#id`, `this` and property reads (`this.value`, `#qty.valueAsNumber`) are resolved when the phrase *fires* (after any debounce), not when the event arrived, and never at parse time (§8.2). Nothing else happens at event time: the executor does not cancel or stop the DOM event (§8.3), so there is no decision that could depend on resolution.
9. **A verb takes one argument.** A verb declared with a string signature takes one scalar, positionally: `set(5)`, `transform('upper')`, `removeRow(this)`. A verb declared with a record signature takes one **object literal** whose keys are the record's keys: `setAttr({name: 'aria-expanded', value: 'true'})`; a key whose signature admits `undefined` may be omitted. A verb declared `"undefined"` takes none. Two bare arguments (`setAttr('aria-expanded', 'true')`) is a grammar error; there is no positional order to get wrong because the grammar never has one (§10.21).
10. **Argument kinds:** number, single-quoted string, `true`/`false`, `#id` (resolves to the element), `this` (the element the phrase was read from: the trigger for `on-*`, the implementation's own element for a continuation phrase, §5.4), a **property read**, `ref.value`, `ref.checked` or `ref.valueAsNumber` (rule 11); or an object literal, one level deep, whose values are those kinds. No nested objects, no arrays, no expression language; `set(qty * 2)` is not legal.
10. **`this` and `#id` are element references; exactly three properties may be read from them.** In receiver position a dot is always followed by a call: `this.reset()` sends a verb to the trigger. In argument position a ref may be followed by one of a closed list of platform property names with no parentheses: `this.value`, `#agree.checked`, `#qty.valueAsNumber`. These are reads of the platform's own properties, with the platform's own types: `value` is whatever the element's `value` property holds (a string on `<input>`, `<select>` and `<textarea>`, a number on `<progress>`, `<meter>` and `<li>`), `checked` is a boolean, `valueAsNumber` is a number or `NaN`. Nothing is coerced; a `"number"` signature fed `this.value` from a text field fails validation with a message that names `valueAsNumber`. Reading a property the resolved element does not have (`#panel.checked` on a `<div>`) is a `console.error` and the phrase is skipped. `this.parentElement`, `this.closest('li')`, `this.dataset.x` and every other property are not legal; the list is closed, and relative navigation lives in implementation code. A read is never a receiver and never appears mid-chain: `this.value` alone is not a phrase, and `#a.value.set(1)` is a grammar error.
12. **Selectors appear only inside string arguments** (`'.amount'`, `':scope > li'`). An implementation that accepts one scopes it to an element it was also given. The grammar sees a string; the implementation's schema types it as a selector.
13. **Errors are local.** A missing `#id` fails its phrase only, logged once per element. A key under a non-keyboard attribute, a modifier before a verb, a second receiver (bare or parenthesised), a second key before the colon, a second positional argument, or property access on `this` are grammar errors: logged once, phrase skipped. An argument that fails the verb's signature is a dispatch error at the receiver: logged once, that link skipped and the chain aborted.
14. **One verb per call, one call per link.** There is no `calc, format` shorthand; write two links or two phrases.
15. **The DSL never touches the platform's event machinery.** No phrase, modifier or executor step calls `preventDefault()` or `stopPropagation()` on the DOM event. Whether the browser's default action runs, and whether the event bubbles, is said on the element with the `prevent-default` and `no-propagate` implementations (§5.5, §8.3).

### 3.4 Reserved names

`debounce`, `throttle`, `once` are modifiers; an implementation may not define a verb with those names. `this` is the only keyword. `value`, `checked` and `valueAsNumber` are the only names that may follow a ref without parentheses (rule 11); they are property names, not verbs, so an implementation may still define a verb called `value()`, distinguished by its parentheses.

---

## 4. The `interaction` event

```ts
class InteractionEvent extends Event {
  readonly verb: string;            // "show"
  readonly arg: unknown;            // resolved: 5 | "currency" | HTMLElement | { name: string, value: string } | undefined
  readonly source: Element;         // the element whose attribute the phrase came from (what `this` resolved to)
  readonly originalEvent: Event;    // click / input / keydown …
  handled: boolean;                 // set true by the host when an implementation owned the verb
  error?: unknown;                  // set by the host when validation or the verb threw
  result?: unknown;                 // set by the host: the verb's return value (a value, never awaited)
  constructor(init: { verb; arg; source; originalEvent }) {
    super("interaction", { bubbles: false, cancelable: true });
    …
  }
}
```

- **A plain `Event`.** `InteractionEvent` extends `Event` and nothing else. The library never shares listeners with the browser's native invoker machinery, so there is no shared event class to inherit and `instanceof` stays unambiguous.
- **Non-bubbling.** A host receives interactions aimed at itself and nothing else; the `if (e.target !== el) return` guard in every implementation goes away.
- **`preventDefault()` aborts the rest of the chain** for that receiver. This is the guard-verb mechanism: `validate().send()`.
- **Three return channels, because a DOM event has none.** `dispatchEvent` returns normally whatever a listener does: an exception in a listener is reported to `window.onerror` and swallowed, and an event nobody listens to is indistinguishable from one that was handled. So the host writes what happened onto the event (`handled` when it found an implementation owning the verb, `error` when `sig.validate` or the verb body threw (the host is the last frame that can catch), `result` for the return value) and the executor reads them after dispatch (§8.1). Without `handled`, a typo'd verb or an element missing its `implements` is silent; without `error`, a synchronous throw leaves `result` undefined and `defaultPrevented` false and the chain continues. `preventDefault()` stays separate from `error`: a guard saying no is not a failure and is not logged. Implementations never set it themselves.
- **No `isTrusted` anywhere.** Tests dispatch real DOM events on triggers and let the host produce the interaction.
- **The `command` event is not part of this system.** If a page also uses native invokers (`<button commandfor command="show-modal">`), an implementation may listen to `command` like any other DOM event via `onCommand`; it has no special status.

---

## 5. Hosts and implementations

### 5.1 Host

One customized built-in per tag, defined with [`auto-wc`](https://github.com/AceCodePt/auto-wc) via `defineInteractableHost("input")` → `interactable-input`. The host does two independent jobs:

**Trigger side (new).** In `connectedCallback`, scan `this.getAttributeNames()` for `on-*`; for each, bind a listener on itself:

```ts
for (const name of this.getAttributeNames()) {
  if (!name.startsWith("on-")) continue;
  const type = name.slice(3);
  const handler = (ev: Event) => runPhrases(this, parse(this.getAttribute(name)!), ev);   // value read at event time
  this.addEventListener(type, handler, { passive: true });               // the DSL never cancels; prevent-default does
  if (!(("on" + type) in this) && !LEGACY_EVENTS_WITHOUT_IDL.has(type)) console.warn(`[Interactable] on-${type} on ${describe(this)}: <${this.localName}> has no "${type}" event; custom events are fine, but check the spelling and case`);
  warnIfNativeActionLikelyUnwanted(this, type);                          // <form on-submit>, <a href on-click> without prevent-default
  this._interactionCleanup.push(() => this.removeEventListener(type, handler));
}
```

This runs directly in `connectedCallback`, **not** behind the implementation-loading path: listeners depend on nothing that loads, so a trigger is live the moment it connects even if the same element's `implements` is still being fetched. `disconnectedCallback` runs the cleanup list. Nothing else is required for the trigger side.

**Receiver side.** Read `implements`; for each name, check the implementation's `tags` admits `this.localName` (a mismatch is a `console.error` naming the element, the implementation and its `tags`, and the name is skipped: `implements="autogrowable"` on a `<div>` reports `autogrowable attaches to <textarea>, <input>; skipped on div#notes` and the host carries on with its other names); instantiate the factory with `(this, bindAttributes(this, name, def))` (lazily via `ensureImplementation`), wire implementation `on*` methods as listeners on itself, forward `attributeChangedCallback` / `connectedCallback` / `disconnectedCallback` to implementations, and **route `onInteraction(e)`** to the first implementation in `implements` order that declares `e.verb`, after validating `e.arg` against the verb's signature (§5.3).

**Readiness.** The host defers when a name in `implements` has not finished loading (the lazy loader's `ensureImplementation` returns a promise; `didEnsure` is set only once all have registered). `onInteraction` therefore does **not** run behind that deferral: a deferred callback would run after `dispatchEvent` has returned, the executor would already have read `handled === false` and logged a false "no implementation", and whatever the late verb put on the event would be read by nobody. Instead, an interaction that arrives before the host is ready is reported *as* that: the host sets `e.handled = true` and `e.error = new NotReadyError(name, verb)`, the executor logs `#order implements requestable, still loading; send() dropped` and stops the chain. Nothing is queued (a queued interaction is a chain that waits, which §8.6 rules out) and the DOM is unchanged, so the user can simply try again. The gap exists only for the lazy loader on first use; with the explicit-import path (§9.1: `import "…/requestable.js"` before the markup), every implementation is registered when the element connects, `didEnsure` is true synchronously, and there is no gap.

**Rule for `is=`.** An element carries `is="interactable-<tag>"` if it has `implements`, any `on-*` attribute, or both. It carries an `id` only if something else addresses it. Implementations and interactions are independent: an element may have either, both, or neither.

**Reporting.** The host and the executor report through `console.error` and `console.warn`; they do not throw. This is not softness, it is where the code runs. A host's methods are called by the browser (`connectedCallback`, `attributeChangedCallback`, event listeners), and the browser owns the exceptions thrown from them: it reports the exception to `window.onerror` and continues. In `connectedCallback` a throw abandons the rest of the callback, so one misspelled `implements` name would leave the element's other implementations uninstantiated and its `on-*` attributes unbound, and the failure would surface on the features that were spelled correctly. In a listener a throw is swallowed by `dispatchEvent` (§4), which is why the host records it on `e.error` instead. `console.error` gives the author the same red entry, message and stack, at the line that is actually wrong, with nothing else on the element affected. `throw` is reserved for code that runs on our own stack with our own caller: `defineImplementation` and the registry at definition time (a `state` key registered twice with different signatures, a verb in `verbs` with no method in the factory), where the exception reaches the developer who wrote the call and aborts something that should not half-succeed. The split between the two console levels is whether a legitimate reading exists. `console.error` when there is none: an `implements` name the registry does not know, a tag outside the implementation's `tags`, a receiver `#id` not in the document, a verb no implementation on the receiver owns, a verb that threw, an interaction dropped because its host was still loading. `console.warn` when the code may well be right and the author should look: an `on-<type>` the element has no event for (custom events, §3.1), a `<form on-submit>` without `prevent-default` (§8.3), a verb that returned a promise (§8.6). Every "log" in this document means one of these two.

**Static names, live values.** `observedAttributes` cannot list attribute names that vary per element, so the set of `on-*` attributes is fixed at connect time: attribute names are static, and only their values are live. The *value* of an `on-*` attribute is read at event time, so editing `on-click="#a.show()"` to `"#b.show()"` takes effect on the next click with no observer. This is not for server swaps: a swapped element is a new element and connects and parses regardless. It is for in-place edits, `setAttribute("on-click", …)` from a script and editing the attribute in devtools, and above all so that the attribute in the DOM and the behaviour of the element never disagree. Parsing once at connect and closing over the result would have to either observe the attribute (per-element observers, which this design removed) or let edits silently do nothing. Re-reading costs a `getAttribute` and a cache lookup per fire (§8.2), not a parse. Adding a brand-new `on-*` attribute after connect requires re-inserting the element.

`observedAttributes` cannot grow, so a host gets attribute changes from two places. The class snapshots the union of registered implementations' schema keys at definition time, and the browser delivers changes to those attributes synchronously through `attributeChangedCallback`. But an implementation can register after the host was defined (a tag-less one imported from its own CDN bundle, or any bundle loaded after another one defined the host), and the browser reads `observedAttributes` once. So each host element also runs one `MutationObserver` on itself whose `attributeFilter` is the current union of registered keys at connect, refreshed as implementations attach; a change to a key the snapshot missed reaches the implementations' `attributeChangedCallback` as a microtask. The observer is the reason registration order does not freeze the observed set, and it is never used for `on-*`, whose values are re-read at event time (§8.2). An empty union is legal: a host defined before any implementation brings config or state observes nothing through the snapshot and still defines without error.

### 5.2 Four kinds of element

The `is=` rule produces exactly four shapes, and every element in a page is one of them:

| Kind | Has | Example |
| --- | --- | --- |
| **Self-contained** | `implements` | `<textarea is="interactable-textarea" implements="autogrowable">`: everything happens inside via the implementation's own `on*` handlers and attributes; no id, no `on-*` |
| **Trigger-only** | `on-*` | `<button is="interactable-button" on-click="#modal.show()">`: causes things elsewhere, never a receiver; the host exists only to bind the listener |
| **Receiver** | `implements` + `id` | `<dialog is="interactable-dialog" id="modal" implements="revealable">`: the id is load-bearing: it exists so others can address it |
| **Self-acting** | `implements` + `on-*` (+ `id` if also addressed) | `<input is="interactable-input" implements="modifiable" on-keydown="escape: this.reset()">`: triggers on itself; `this` means no id is needed for that |

The fourth kind is why `this` exists: without it, an element addressing itself needs an id, and rows cloned from a template need generated ids. With it, `on-click="this.remove()"` works on every clone.

### 5.3 Implementation definition

One call declares the name, the tags the implementation may attach to, the config and state it brings, its verb signatures, and the factory, and the factory is type-checked against the signatures, so there is one place where a verb's shape is written.

```ts
import { defineImplementation } from "../_implementation-definition";

export const modifiable = defineImplementation("modifiable", {
  tags: ["input", "textarea", "output", "select"],
  config: { step: "number | undefined" },                  // authored: modifiable-step, read-only
  // no min/max here: <input> already has them, typed, as el.min / el.max; <textarea> has no business carrying them
  verbs: {
    set:   "string",
    inc:   "number | undefined",
    dec:   "number | undefined",
    clear: "undefined",
    reset: "undefined",
  },
}, (el, attrs) => ({ /* §5.4 */ }));

export const listable = defineImplementation("listable", {
  tags: ["ul", "ol", "tbody"],
  config: { "min-rows": "number | undefined" },
  verbs: {
    removeRow: HTMLElement,                                 // any element inside a row
    adopt:     HTMLTemplateElement,                         // narrowed: instanceof at runtime
    clear:     "undefined",
  },
}, (el, attrs) => ({
  removeRow: (_e, from) => { const row = from.closest(":scope > *"); if (row && el.children.length > (attrs["min-rows"] ?? 0)) row.remove(); },
  adopt:     (_e, tpl)  => el.append(tpl.content.cloneNode(true)),
  clear:     ()         => { while (el.children.length > (attrs["min-rows"] ?? 0)) el.lastElementChild!.remove(); },
}));

export const attributable = defineImplementation("attributable", {
  verbs: {
    setAttr:    { name: "string", value: "string" },        // object literal argument
    toggleAttr: "string",
    removeAttr: "string",
  },
}, (el) => ({
  setAttr:    (_e, { name, value }) => el.setAttribute(name, value),
  toggleAttr: (_e, name) => el.toggleAttribute(name),
  removeAttr: (_e, name) => el.removeAttribute(name),
}));
```

**Scalar signatures are tsyntax strings.** Every attribute and every scalar argument is declared in TypeScript's own type syntax (`"number | undefined"`, `"'upper' | 'lower'"`, `` "`${number}px`" ``) parsed identically by `tsc` (via `DSLValidate`, which also autocompletes union members) and at runtime by `parseValueAgainstDSL`. A malformed signature fails the build at the call site. There is no second schema vocabulary and no transform layer (§10.19).

**Element signatures are constructors.** A slot whose value is an element reference (`#id` or `this` in the DSL) is declared with the element class: `HTMLElement`, `HTMLTemplateElement`, `HTMLButtonElement`. [tsyntax](https://github.com/AceCodePt/tsyntax) is a scalar language and an element is not a scalar; the grammar already knows a bare ref is an element and the executor has already resolved it, so what remains is `instanceof`, which the constructor gives for free along with `InstanceType<>` for the handler's parameter. Nothing is registered into tsyntax (§10.23).

**A verb has one argument.** The signature is a **slot** (one tsyntax string or one constructor) or a **record of slots** (one object literal whose keys are the record's keys). `"undefined"` declares a verb with no argument. Positional lists do not exist, so adding an argument can never silently re-bind a call site: a slot becoming a record forces every `transform('upper')` in the HTML to become `transform({mode: 'upper', …})`, which the parser reports (§10.21). A record key whose slot admits `undefined` may be omitted from the literal; one that does not is required.

**Tags type the element.** The tag list is spelled in strings and resolved through `HTMLElementTagNameMap`, so `el` in the factory is the union of the listed element classes and `.value` is reachable without a cast. Omitting `tags` means "any tag": `el` is `HTMLElement` and the implementation attaches anywhere, right for `loggable` or `no-propagate`. The same list is the runtime whitelist the host checks at connect (§5.1) and the set of `interactable-<tag>` hosts the registry ensures exist (§10.20).

**Declare only what you invent.** An implementation never declares an attribute the platform already owns. `min`, `max`, `step`, `type`, `open`, `value`, `checked`, `popover` exist on the elements they belong to, typed and validated by the browser, reachable as properties: `modifiable` on an `<input type="range">` reads `el.min`, and on a `<textarea>` there is no `min` and inventing one would put an attribute on the element that has no meaning there. The narrowing is done by `tags` and, where a tag is not enough, by a connect-time check (`el.type === "range"`), not by a schema entry. What is left to declare is exactly the information the implementation brings to the element, in two tiers (§6):

- **`config`**: authored input, read on the way in and never written by a verb. Stored as `<name>-<key>` (`modifiable-step`, `modifiable-formula`, `requestable-url`). Unique by construction, so two implementations on one element cannot collide.
- **`state`**: live information the implementation has to hold because the platform holds nothing for it. Stored as `data-<key>` (`data-open` on a panel, `data-value` on a computed total). Read/write through `attrs`.

Most implementations declare no `state` at all: `dirtyable` compares `el.value` with a baseline it captured at connect, `revealable` on a `<dialog>` reads `el.open`, `modifiable` writes `el.value`. A `state` entry is the exception, and the smell to check is whether the platform already has the thing under another name (§10.25, §10.26).

```ts
type Tag  = keyof HTMLElementTagNameMap;
type El<T extends readonly Tag[] | undefined> = T extends readonly Tag[] ? HTMLElementTagNameMap[T[number]] : HTMLElement;

type Ctor = abstract new (...a: any) => Element;
type Slot = string | Ctor;                                                  // tsyntax string | element class
type Sig  = Slot | Record<string, Slot>;                                    // one value | one object

type SlotOf<S extends Slot> = S extends string ? DSLInfer<KW, S> : S extends Ctor ? InstanceType<S> : never;
type ArgOf<S extends Sig>   = S extends Slot ? SlotOf<S> : { [K in keyof S]: SlotOf<S[K] & Slot> };
type Attrs<C extends Record<string, string>, S extends Record<string, string>> =
  { readonly [K in keyof C]: DSLInfer<KW, C[K]> } & { [K in keyof S]: DSLInfer<KW, S[K]> };   // config read-only, state read/write

type Implementation<V extends Record<string, Sig>> = ImplementationInstance & {
  [K in keyof V]: (e: InteractionEvent, arg: ArgOf<V[K]>) => unknown;
};

declare function defineImplementation<
  const T extends readonly Tag[] | undefined,
  const C extends Record<string, string>, const S extends Record<string, string>, const V extends Record<string, Sig>,
>(
  name: string,
  decl: { tags?: T; config?: Validated<C>; state?: Validated<S>; verbs: ValidatedSigs<V> },   // DSLValidate mapped over every string
  factory: (el: El<T>, attrs: Attrs<C, S>) => Implementation<V>,
): ImplementationDef<T, C, S, V>;
```

**Verbs are data.** Because scalar signatures are strings and element signatures are classes with names, the `verbs` record serialises for editor tooling with nothing executed, `JSON.stringify` with a replacer that emits `ctor.name`, and it types the generated TypeScript DSL (`on.click(qty).inc(5)` / `on.click(toggle).setAttr({ name: "aria-expanded", value: "true" })`). The registry's type is the union of registered definitions, so `VerbName` and `ArgFor<"inc">` are derivable project-wide.

**No-argument verbs.** `"undefined"` is the honest type of a missing argument and keeps every scalar slot a tsyntax string. If it reads badly in practice, `null` as an alias is a one-line change in `Slot`; decide when writing `_implementation-definition.ts`.

### 5.4 Implementation instance

```ts
(el, attrs) => {                            // el: HTMLInputElement | HTMLTextAreaElement | …; attrs: { readonly step?: number }
  const write = (v: string | number) => {
    if (el.value === String(v)) return;
    el.value = String(v);                                       // live tier: the property, not the attribute
    el.dispatchEvent(new Event("input", { bubbles: true }));   // so the element's own on-input fires
  };
  const bound = (k: "min" | "max") =>                          // the platform's own attributes, where they exist
    el instanceof HTMLInputElement && el[k] !== "" ? Number(el[k]) : undefined;
  const clamp = (n: number) => Math.min(bound("max") ?? Infinity, Math.max(bound("min") ?? -Infinity, n));
  return {
    set:   (_e, v)                   => write(v),                                    // v: string
    inc:   (_e, n = attrs.step ?? 1) => write(clamp(valueOf(el) + n)),               // n: number | undefined
    dec:   (_e, n = attrs.step ?? 1) => write(clamp(valueOf(el) - n)),
    clear: ()                        => write(""),
    reset: ()                        => write(el.getAttribute("value") ?? ""),   // back to what the author wrote
  };
}
```

TypeScript checks this object against `Implementation<V>` in both directions: a verb missing from the object, a verb present but not declared, or a parameter that disagrees with its signature is a compile error. The factory cannot drift from the declaration.

**`attrs` is a typed proxy over the declared attributes**, built once per instance by `bindAttributes(el, name, decl)`. Each getter reads the attribute live and validates it through the same compiled signature verbs use (so `attrs.step` is `number | undefined`, never a string). `config` keys are getters only: TypeScript rejects `attrs.step = 2` and the runtime proxy throws, because authored input is the baseline a reset returns to. `state` keys also have setters that write the `data-*` attribute (`undefined` removes it); that is the sanctioned way for a verb to mutate invented state (§6): the attribute changes, `attributeChangedCallback` renders. `attrs.step` maps to `modifiable-step`, `attrs.open` maps to `data-open`; the body does not spell either. The proxy is a parameter rather than properties on `el` (which already has `min`, `step`, `open` as the platform's own) or on `this`, which is absent in the factory body and in arrow-function verbs (§10.25).

Conventions:

- **`on*` methods are event handlers** on the host element ([`auto-wc`](https://github.com/AceCodePt/auto-wc) semantics; `auto-grow`'s `onInput` still works). **Every other method is a verb** and must appear in `verbs`.
- **Verbs receive `(e, arg)`.** `arg` is the scalar, element or object, already validated against the signature.
- **A verb's inputs come from `arg`; `e.source` and `e.originalEvent` are context, not input.** `removeRow(this)` passes the button even though `e.source` is the same button, for the same reason `set(this.value)` exists when `e.source.value` is right there: the verb stays ignorant of who triggered it. A verb that reads `e.source` to learn *what to act on* is coupled to its trigger, cannot be called with a different target (`#list.removeRow(#row3)`), and needs a positioned fake source in tests. `e.source` is for metadata *about* the trigger: `revealable` setting `aria-expanded` on whichever button opened it, `loggable` recording `e.originalEvent.type` (§10.24).
- **Verbs are synchronous.** A verb does its work and returns; the host stores the return value on `e.result`. An implementation that starts asynchronous work (`requestable`) starts it inside the verb and consumes the promise inside its own closure; it never returns it. The host warns at the console if a verb returns a thenable, because that is an author trying to sequence async work in a chain, which lives in a continuation phrase instead (§8.6).
- **Implementations never call verbs on other elements.** An implementation whose work completes later declares **its own, explicitly named continuation phrases** as config (`requestable-after`, `requestable-error`) and hands the string to the exported `runPhrases(el, str, e.originalEvent)` when the moment arrives. `runPhrases` has one rule for `this`: it is the element the phrase was read from (the trigger for an `on-*` attribute, the implementation's own element for a continuation), so passing `el` first is what binds `this` to the requestable element. The original trigger is not carried into the continuation; a continuation that needs another element names it by id. The names are per implementation, not a library-wide `<name>-after` convention: what "after" and "error" mean is specific to the work (a request failing and an upload failing are different events with different follow-ups), so the attribute that names them belongs to the implementation that knows.
- **Registering an implementation ensures its hosts.** `defineImplementation` registers the definition; the registry calls `defineInteractableHost(tag)` for every tag in `tags` (or nothing, for tag-less implementations, whose hosts come from the page or the auto-loader). `defineInteractableHost` is idempotent, it returns the existing class when `customElements.get("interactable-<tag>")` is defined, so `modifiable` and `pasteable` both asking for `interactable-textarea` produce one host class. The host class is per tag, never per implementation; that is what lets `implements="pasteable dirtyable"` share one element.

---

### 5.5 The generic implementations

Three tag-less implementations ship with the protocol and are the basis every page starts from. They attach to anything (`tags` omitted), declare no `state`, and are what the DSL delegates to for everything it deliberately does not do itself.

```ts
// registry/behaviors/no-propagate
export const noPropagate = defineImplementation("no-propagate", {
  config: { events: "string | undefined" },              // no-propagate-events; default "click"
  verbs: {},
}, (el, attrs) => bindEvents(el, () => attrs.events ?? "click", e => e.stopPropagation()));

// registry/behaviors/prevent-default - its twin
export const preventDefault = defineImplementation("prevent-default", {
  config: { events: "string | undefined" },              // prevent-default-events; default derived from the element's own on-* attributes
  verbs: {},
}, (el, attrs) => bindEvents(el, () => attrs.events ?? derivedDefaults(el), e => e.preventDefault(), { passive: false }));

const DERIVABLE = new Set(["submit", "click", "keydown"]);            // the three events a phrase author routinely claims

const derivedDefaults = (el: HTMLElement) => {
  const claimed = el.getAttributeNames()
    .filter(n => n.startsWith("on-") && DERIVABLE.has(n.slice(3)))
    .flatMap(n => {
      const type = n.slice(3);
      if (type !== "keydown") return [type];
      return parse(el.getAttribute(n)!).map(ph => ph.key).filter(Boolean).map(k => `keydown:${k}`);   // an unkeyed on-keydown contributes nothing
    });
  if (claimed.length) return claimed.join(",");
  return el instanceof HTMLFormElement              ? "submit" :        // no phrase to read: fall back to the tag
         el instanceof HTMLAnchorElement && el.href ? "click"  :
         el instanceof HTMLButtonElement            ? "click"  : "";
};
```

**Derivation.** With `prevent-default-events` omitted, `prevent-default` cancels the events the element's own `on-*` attributes claim, restricted to `submit`, `click` and `keydown`. A keyed `on-keydown` phrase (`enter: …`) contributes `keydown:enter`; an unkeyed `on-keydown` contributes nothing, because a bare `keydown` cancels typing and Tab and is almost never meant. Only when the element claims none of the three does the tag decide: `<form>` cancels `submit`, `<a href>` and `<button>` cancel `click`; anything else derives nothing and warns at connect that `prevent-default` has no effect. The list is derived once, at connect, like the set of `on-*` names in §5.1. Why these three and no others: they are the events whose default action a phrase author is routinely replacing, and what a model writing this markup will emit constantly; `contextmenu`, `dragstart`, `drop` (which also needs `dragover`), `wheel` and `touchstart` (which block scrolling) are rare, easy to get wrong by inference, and stated explicitly.

**The event list.** Comma-separated entries, each `event` or `event:key`. The key part is legal only on `keydown` / `keyup` and uses the DSL's key vocabulary (`KeyboardEvent.key`, case-insensitive, `space` for `" "`) through the same `matchesKey` the parser uses (`registry/interactable/keys.ts`), so there is one set of key names in the project. A bare `keydown` cancels every key, including Tab, and is almost never what anyone means; that is why derivation ignores unkeyed `on-keydown` phrases. A `<button>` derives `click`, not its activation keys: Enter and Space on a focused button synthesise a `click`, so cancelling `click` covers keyboard and mouse alike, whereas cancelling only the keys would leave a mouse click submitting the form. Entries are one event or one event-key pair each; there is no `keydown:enter|space`, for the same reason the DSL has no key lists (rule 4).

`bindEvents(el, events, handler, opts?)` is the add/remove/re-add helper both implementations share; it parses the list into `(type, key?)` entries, binds one listener per type, checks the key inside the handler, and re-reads `events()` in `attributeChangedCallback` so the list is live. The two implementations differ in one call and one default. Neither has verbs: they are statements about the element, not things to send to it.

Both listen on the element, so both also receive events bubbling up from descendants; `no-propagate` behaves this way today. `prevent-default-events="keydown:enter"` on a `<div>` that contains a `<textarea>` therefore cancels Enter in the textarea. Put the implementation on the element whose keys or actions are meant, not on an ancestor.

```html
<form is="interactable-form" implements="prevent-default no-propagate" no-propagate-events="submit"
      on-submit="#api.send(); #status.set('Saving…')">                                  <!-- derived from on-submit: submit -->

<div is="interactable-div" implements="prevent-default" prevent-default-events="contextmenu"
     on-contextmenu="#menu.showAt(this)">                                                <!-- not derivable: stated -->

<input is="interactable-input" implements="prevent-default"
       on-keydown="enter: #search.run(this.value)">                                          <!-- derived from the keyed phrase: keydown:enter; typing untouched -->

<section is="interactable-section" implements="prevent-default no-propagate"
         prevent-default-events="dragover,drop" no-propagate-events="drop"
         on-drop="#uploads.accept(this)">                                                <!-- not derivable; dragover must be cancelled or drop never fires -->

<canvas is="interactable-canvas" implements="prevent-default" prevent-default-events="wheel"
        on-wheel="#viewport.zoom(this).throttle(16)">                                    <!-- never derived: blocks scrolling, so it is always stated -->
```

**`revealable`** is the third: `show()`, `hide()`, `toggle()` over derived strategies (§6.1): `<details>` and `<dialog>` write `el.open` / `showModal()`, a `[popover]` calls `showPopover()`, anything else gets `data-open`. It is the model for how a generic implementation behaves: it declares nothing the platform already holds, it derives what it can from the element it landed on, and it invents state only in the one row where nothing exists.

The three together are the answer to "what does the DSL do about the platform": nothing. Default actions, propagation and visibility are said on the element, by name, where a reader and a grep find them.

---

## 6. State convention: three tiers, and only one is ours

The display is never the source of truth. A verb's job is to **mutate state**; the reaction to state (text, classes, ARIA, `hidden`) happens in `attributeChangedCallback` or in response to the platform's own events. Verbs do not render.

Every piece of information on an element lives in one of three tiers, and the platform already models the first two for form controls:

| Tier | What it is | Where it lives | Who writes it |
| --- | --- | --- | --- |
| **Authored** | What arrived in the markup: the server's answer, the reset baseline | Attributes: `value`, `min`, `checked`, and our `config` (`modifiable-step`) | The author / the server; implementations only read |
| **Live** | Current state, which may have diverged from authored | Properties where the platform has them (`el.value`, `el.checked`, `el.open`, popover state); `data-*` from our `state` where it does not | Verbs, the user, the platform |
| **Derived** | Presentation | Classes, ARIA, `textContent`, `hidden` | The render callback only |

The `value` attribute and the `value` property are the canonical case. `el.value = "x"` does not touch the attribute, and that is not an inconsistency: the attribute is what the author wrote, the property is the current value. `checked` and `selected` have the same attribute/property pair. This is what makes SSR trivial: the server writes `value="42"`, the browser parses it into both tiers, hydration adds nothing, and nothing can mismatch because the client never reconstructed state the markup did not already carry.

```ts
// dirtyable - no attributes written; the baseline lives in the closure
(el) => {
  let baseline = el.value;                                   // what the field held when it connected (SSR'd value included)
  const render = () => el.classList.toggle("is-dirty", el.value !== baseline);
  render();
  return {
    onInput:   render,
    markClean: () => { baseline = el.value; render(); },     // move the baseline up to the current value
  };
}
```

```ts
// revealable on a plain panel - the one case with invented state
// state: { open: "boolean | undefined" } → data-open
(el, attrs) => ({
  show:   () => { attrs.open = true; },
  hide:   () => { attrs.open = undefined; },
  toggle: () => { attrs.open = attrs.open ? undefined : true; },
  attributeChangedCallback(name) { if (name === "data-open") el.hidden = !attrs.open; },   // renders
})
```

Rules:

- **Read the platform before inventing.** `value`, `checked`, `open` on `<details>` and `<dialog>`, popover's own state and `toggle` event, `min`/`max`/`step` on inputs. A `state` entry exists only when none of these hold the thing.
- **`config` is read-only.** Authored attributes are never written by a verb. A verb that needs its own baseline keeps one in the implementation's closure, as `dirtyable`'s `markClean` does; it does not overwrite what the author wrote, and it does not write the `value` attribute either, which is the author's.
- **Invented live state is `data-*`.** One namespace, conventionally data rather than styling hooks, reflected as `el.dataset`, and visible in the inspector. Writes go through `attrs`, reads in `attributeChangedCallback` render.
- **Closure state** for transient internals (in-flight request, animation frame id, debounce timers).
- **Numbers written into text also go to `data-value`.** Every implementation that reads a number reads it through one `valueOf(el)` helper: `.value` → `data-value` → parsed `textContent` as a last resort.

There is no store, no signals, no cross-element watching. The DOM is the store, the platform's properties and our `data-*` are the variables, ids are the addresses. `reveal-when-target` / `-attribute` / `-value` are removed: in the push model, whoever changes B fires A.

### 6.1 Derived strategies

An implementation whose verbs mean different things on different elements does not ask the author which element it is on. `revealable` picks at connect, from information already present:

| Element | Detected by | `show()` | Live state read from |
| --- | --- | --- | --- |
| `<details>` | tag | `el.open = true` | `el.open` |
| `<dialog>` | tag | `el.showModal()`, or `el.show()` when `revealable-modal="false"` | `el.open` |
| popover | `el.hasAttribute("popover")` | `el.showPopover()` | `el.matches(":popover-open")` |
| anything else | fallback | `attrs.open = true` (`data-open`) | `attrs.open` |

Focus trapping, the top layer, light dismiss, `::backdrop` and Escape handling come with the first three for free; writing `data-open` on a `<dialog>` would be a dead attribute next to real machinery. The fourth row is the only one that invents anything, and it is the only row where nothing already exists. The tag list for such an implementation is omitted (it attaches anywhere); the strategy table is the narrowing (§10.27).

---

## 7. Dynamics

Four cases, one of which needs a selector.

| Case | Answer |
| --- | --- |
| **Dynamic triggers** (rows cloned from a template) | Put `is="interactable-<tag>"` in the template. On Chrome and Firefox the clone upgrades synchronously on insertion and binds its listeners in `connectedCallback`; `on-click="this.remove()"` / `#list.removeRow(this)` works on every clone with no generated ids. On Safari, and on any engine when the auto-loader adds `is=` for you, the upgrade is deferred (§8.5); see the note below. |
| **Dynamic receivers** (a row's own subtotal) | Receivers stay ids or `this`. Either address a stable ancestor and let the implementation find the relative element from `e.source` (`closest("li")`), or stamp ids in the template. |
| **Dynamic data sources** (sum whatever inputs exist) | Formula function with a selector: `#total implements="modifiable" modifiable-formula="sum('#list .amount')"`, recomputed by `#total.compute()`. `sum(selector)`/`count(selector)` run `document.querySelectorAll(selector)` at fire time. |
| **Change without interaction** (server swap, external mutation) | The implementation that performed the change runs the follow-up via its own continuation phrase (`requestable-after="#count.compute()"`, the count output carrying `modifiable-formula="count('#results > li')"`), a new synchronous chain with `this` bound to that element. Chains never span the change themselves. Otherwise out of scope for v1. |

**Upgrade timing is not uniform, and the document owes the author the exact shape of it.** `is=` written in the markup (server-rendered or in a `<template>`) upgrades synchronously on insertion in Chrome and Firefox: the element is a host before the next line of script runs. Two paths are asynchronous:

- **The auto-loader.** Customized built-ins only upgrade when `is` is present at *creation*, so the auto-loader cannot simply set the attribute; it watches with a `MutationObserver` (a microtask after insertion), then **replaces the node**: `createElement(tag, { is })`, copy attributes, move children, `replaceChild`. Between insertion and that swap the element has no listeners; a programmatic `.click()` or `dispatchEvent` in that gap is lost, focus on the element is dropped, and any JS reference captured before the swap points at a detached node. `getElementById` and the DSL's late-bound `#id` (rule 8) are unaffected, because they look up by id at fire time.
- **Safari**. [`@ungap/custom-elements`](https://github.com/ungap/custom-elements) is itself a `MutationObserver` polyfill, so even explicit `is=` in dynamically inserted markup upgrades a tick late there. Initial page content upgrades when the polyfill runs, which is no worse than any script-bound listener.

The consequences for authors: write `is=` explicitly in templates and server output, that is the explicit path this document argues for throughout, and treat the auto-loader as a prototyping convenience, not a production dependency. Code that inserts a trigger and immediately drives it programmatically must await `customElements.whenDefined()` plus a microtask, or drive the *receiver* directly (`dispatchInteraction`). Nothing in the DSL itself is affected, because refs resolve at fire time and user gestures arrive well after a microtask.

Selector rule: **selectors may appear in arguments, never as receivers.** The dispatch graph stays 1:1, every interaction goes to one element with one `implements`, so completion, grep (`#pop.` finds every writer) and error rules stay exact.

---

## 8. Parser and executor

There is no engine. Two pure library functions, both called from the host mixin.

### 8.1 Pipeline

```
DOM event on the trigger (passive listener bound by the host in connectedCallback)
  → parse(attributeValue)        cached by string → Phrase[] with unresolved refs
  → runPhrases(this, phrases, ev)
      → key filter; drop phrases whose once() is spent
      → throttle/debounce (timer keyed by element + attribute + phrase index)
      → resolve the receiver (#id → getElementById, this → the element the phrase was read from); missing → console.error, skip phrase
          for each link: resolve arg (scalar, or object literal field by field) → dispatch InteractionEvent
            · host: find the implementation owning the verb → e.handled = true
            · host: validate arg against the verb's signature, call the verb - both inside try/catch → e.error on throw
            · executor, after dispatch:  !e.handled → console.error "no implementation on <receiver> handles verb()", stop
                                          e.error    → console.error once with receiver and verb, stop
                                          e.defaultPrevented → stop, quiet
      → once() spent when every link ran and none stopped the chain
  runPhrases itself sits inside the trigger's DOM listener, so it catches everything and never lets an exception escape
```

- **Nested triggers behave like nested `onclick`.** A click on a button with `on-click` inside a `<div on-click>` fires the button's phrase, then bubbles and fires the div's. There is no implicit innermost-wins rule; suppression is explicit via the `no-propagate` implementation on the inner element (§5.5, §10.18).
- **Timers and `once` state live on the host instance**, not in `WeakMap`s; disconnect clears them.
- **Imperative path:** `runPhrases(el, "#pop.show()", someEvent)` is the one entry point, and its first argument is what `this` means; the trigger listener and every implementation's continuation phrase call the same function, so a phrase means the same thing wherever it is written. Implementation methods can also be called directly on the host instance in tests.

### 8.2 Parse cache and resolution

`parse` caches by attribute string. The cached value is an AST in which `#id`, `this` and property reads (`this.value`, `#qty.valueAsNumber`) are **tokens**, not elements or values. Resolution happens inside `runPhrases` per fire; `this` is its first argument, the element whose attribute supplied the string, and a read resolves its ref first and then reads the named property off that element at that instant. Two identical rows share one parse and resolve to two different elements.

`this` is resolved as `token === "this" ? source : document.getElementById(id)`. It is never rewritten into the attribute, never stamps an id on the element, and never consults `event.currentTarget`; the source *is* the host that bound the listener.

**Argument validation is the receiver's job, not the parser's.** The parser knows every literal's kind from syntax alone (bare `5` is a number, `'5'` is a string, `true` is a boolean, `#id` / `this` are elements) so a literal reaches the host already typed: scalars go through `parseValueAgainstDSL` against the slot's tsyntax string, resolved elements go through `instanceof` against the slot's constructor. The only runtime-typed values are property reads, and they carry the platform's type: `this.value` on a text field is a string, `#qty.valueAsNumber` is a number, `#agree.checked` is a boolean. There is no coercion. `#total.add(this.value)` with `add: "number"` fails validation and the message says so: `add() wants number, got string from this.value; on <input type="number"> read this.valueAsNumber`. The author (or the model writing the markup) already knows these names and their types from JavaScript, which is the point of borrowing them (§10.34); tsyntax stays a pure validator. Signatures are compiled to a matcher once, at `defineImplementation`, so the event path does not re-parse the DSL string.

### 8.3 Native default actions and propagation

The executor does neither. Every `on-*` listener is passive and never calls `preventDefault()` or `stopPropagation()`; a phrase describes what happens, not what the browser is allowed to do. Both of those are said on the element, with two tag-less implementations that are the same code with one call swapped (§5.5):

```html
<form is="interactable-form" implements="prevent-default" on-submit="#api.send()">          <!-- submit cancelled -->
<a    is="interactable-a"    href="/docs"                  on-click="#log.track('docs')">Docs</a>   <!-- navigates and tracks -->
<a    is="interactable-a"    href="#p" implements="prevent-default" on-click="#p.show()">…</a>   <!-- in-page action -->
<button is="interactable-button" implements="no-propagate" on-click="#list.removeRow(this)">×</button>  <!-- row's on-click untouched -->
```

`prevent-default` binds its own listeners with `passive: false`, so the executor has no list of non-passive events; `wheel`, `touchstart` and `touchend` triggers are passive like everything else unless the element says otherwise.

Because cancellation is explicit, the destructive forgetful case, `<form on-submit>` submitting natively *and* dispatching, is caught where it is cheap: at connect, a host that carries `on-submit` on a `<form>`, `on-click` on an `<a href>`, or `on-keydown`/`on-keyup` on a `<button>` without `prevent-default` logs one `console.warn` naming the element and the native action that will also run. Nothing is decided at event time, so the timing problem that a cancellation table has (the decision must precede debounce and resolution) does not arise.

A pre-existing `defaultPrevented` does **not** suppress dispatch. `prevent-default` is a sibling listener on the same element and may run before the trigger's; a stranger's cancellation is not the DSL's concern either way.

### 8.4 Not supported

Shadow DOM (events are non-composed; receivers are document ids). Modifier keys (`.ctrl`), `.self`, `.outside`: reserved as future postfix modifiers with the same syntax. There is no `.stop()`, `.prevent()` or `.native()`: propagation and default actions are element-level facts, not phrase-level ones, and belong to `no-propagate` / `prevent-default` (§8.3). Dynamic `on-*` attribute *names* after connect (§5.1).

### 8.5 Safari

Customized built-ins need the [`@ungap/custom-elements`](https://github.com/ungap/custom-elements) polyfill. It was already required for receivers, and because triggers are hosts too it now covers every `interactable-<tag>` element. The exposure is wider, accepted for a single-consumer tool.

Two things the polyfill does not give back. **Timing:** it upgrades via `MutationObserver`, so dynamically inserted `is=` markup becomes a host one microtask after insertion rather than synchronously as on Chrome and Firefox (§7 has the author-facing consequences). **Explicitness:** WebKit's position on customized built-ins is a refusal, not a delay, so `is=` on Safari is permanently a polyfilled attribute with no native meaning. The design accepts both because the alternative, autonomous wrapper elements, costs semantics, form participation and CSS on every element, for every engine, to fix a timing gap on one.

### 8.6 Asynchrony

**Verbs are synchronous and chains never await.** This is the HTMX shape the library exists to reproduce: the client's job is to say what to send and where the answer goes; everything that takes time happens on the server. A `.` chain is a sequence of DOM mutations that runs to completion inside one task, before the browser paints. Any work that finishes later belongs to an implementation that owns it, today `requestable`, and continues by running a new synchronous chain the author wrote into that implementation's own config.

```html
<input is="interactable-input" id="q" on-input="#results.send().debounce(300)">

<ul is="interactable-ul" id="results" implements="requestable"
    requestable-url="/api/search" requestable-include="#q"
    requestable-after="#count.compute(); #status.hide()"
    requestable-error="#status.show()"></ul>
<output is="interactable-output" id="count" implements="modifiable"
        modifiable-formula="count('#results > li')"></output>
```

The trigger's chain is one synchronous link: `send()` aborts the previous in-flight request for `#results`, starts a new one, and returns. When the response lands, `requestable` swaps its children and calls `runPhrases(el, attrs.after, e.originalEvent)` (`this` is `#results` because `#results` is the element the phrase was read from, the same rule that makes `this` the trigger in an `on-*` attribute: a second synchronous chain, in which `this` is an ordinary element reference) here passed as an argument, since rule 11 allows no property access on it. The network gap sits between two chains and has a name and a place in the markup, instead of hiding inside a dot that looks like every other dot.

What this rules out, and why it is the right trade:

| Not possible | Because | Instead |
| --- | --- | --- |
| `#results.send().highlight()`, a link after the response | The chain would have to await, and then every question about what happens while it waits (a second fire, a removed receiver, a swapped `#results`) needs an executor answer | `requestable-after="this.highlight()"` |
| A verb returning a promise | The host ignores the value and warns; the chain has already moved on | Start the work in the verb; consume it in the closure; continue via a config phrase |
| A guard that asks the server | A guard is a synchronous yes/no; a round trip is a request | `send()` with the check server-side, and `requestable-error` for the no |
| `once()` as a double-submit guard for a request | It spends on the first synchronous completion and never re-arms, so a failed request leaves a dead trigger | `requestable`'s concurrency policy, below, plus `aria-busy` for the visual |
| An interaction queued until a lazily loaded implementation arrives | A queued interaction is a chain that waits; the host would answer after `dispatchEvent` returned, to nobody | The host reports `NotReadyError` synchronously (§5.1 Readiness); import implementations before the markup to remove the gap |

**Concurrency policy belongs to the implementation that owns the I/O.** `requestable` keeps one in-flight `AbortController` per element and derives its policy from the method, the way `revealable` derives its strategy from the tag (§6.1): a GET is idempotent, so a new send aborts the previous one (latest wins); anything else may already have happened on the server, so a new send while one is in flight is refused (first wins). `requestable-concurrency="latest | first | all"` overrides. Because `send()` sets `aria-busy="true"` synchronously and clears it on settle, `form[aria-busy="true"] button { pointer-events: none }` disables the trigger with no JavaScript and no cross-element write.

**Continuations run only if the element is still connected.** A response that replaces the requestable element itself (`requestable-swap="outer"`) disconnects its host; there is nothing sensible for `requestable-after` to mean, so it is skipped. The new content carries its own `implements` and `on-*` and upgrades on insertion (§8.5 for Safari timing). Cancellation via the policy above is `AbortError`, which runs neither continuation and logs nothing.

---

## 9. Full examples

Install and consume the published package:

```sh
npm install interactably
```

Each example below imports the CDN bundles from the package (`interactably/dist/cdn/...`); the core bundle ships inside `interactably-core.js`, and the per-implementation bundles (`modifiable.js`, `dirtyable.js`, `listable.js`, …) register their implementation into the core's registry on import, so importing them is the whole setup.

### 9.1 Price calculator

```html
<script type="module">
  import "interactably/dist/cdn/modifiable.js";
  import "interactably/dist/cdn/dirtyable.js";
  import "interactably/dist/cdn/listable.js";
  import { defineInteractableHost } from "interactably/dist/cdn/interactably-core.js";
  for (const tag of ["input", "output", "button", "ul"]) defineInteractableHost(tag);   // idempotent: modifiable/listable already ensured theirs
</script>

<label>Qty
  <input is="interactable-input" id="qty" implements="modifiable dirtyable"
         type="number" value="1" min="0" max="10"
         on-input="#preview.set(this.value)"
         on-keydown="escape: this.reset().markClean()">
</label>
<button is="interactable-button" on-click="#qty.dec()">−</button>
<button is="interactable-button" on-click="#qty.inc()">+</button>
<button is="interactable-button" on-click="#qty.inc(5)">+5</button>
<button is="interactable-button" on-click="#qty.reset().markClean()">Reset</button>
<!-- min/max are the input's own; modifiable reads el.min / el.max and declares nothing for them -->
<output is="interactable-output" id="preview" implements="modifiable">1</output>

<ul is="interactable-ul" id="list" implements="listable" listable-min-rows="1">
  <li>
    <input is="interactable-input" class="amount" type="number" on-input="#total.compute()">
    <button is="interactable-button" on-click="#list.removeRow(this); #total.compute()">×</button>
  </li>
</ul>
<button is="interactable-button" on-click="#list.adopt(#row-tpl)">Add row</button>
<template id="row-tpl"><li>…</li></template>
<output is="interactable-output" id="total" implements="modifiable"
        modifiable-formula="format(sum('#list .amount'), { style: 'currency', currency: 'USD' })">0</output>
```

Kinds present: `#qty` is self-acting (implementations + `on-*` + id because the buttons address it); the six buttons are trigger-only; `#preview`, `#list` and `#total` are receivers; the `<li>` is a plain element; the row is reached through `#list.removeRow(this)`, so it needs no implementation, no host and no id, and cloning it from `#row-tpl` produces nothing that has to be unique. With the auto-loader in the page, every `is=` above can be omitted.

Trace of `+5`: the button's host bound `click` in `connectedCallback` → `parse("#qty.inc(5)")` (cached) → `runPhrases(button, …, clickEvent)` → resolves `#qty` → dispatches `InteractionEvent{verb:"inc", arg:5, source: button}` at `#qty` → host `onInteraction` validates `5` against `"number | undefined"` → `modifiable.inc` → `write(6)` (clamped by `max`) → synthetic `input` → `dirtyable.onInput` sets `data-dirty` → `attributeChangedCallback` adds `is-dirty` → the same `input` reaches `#qty`'s own `on-input` listener → `#preview.set($value)` → `modifiable.set("6")` on the output.

Trace of `×`: the row button's `on-click` → phrase 1 resolves `#list`, arg `this` resolves to the button → `listable.removeRow(e, button)` uses `button.closest("li")` → phrase 2 (independent) resolves `#total` → `modifiable.compute(e)` re-evaluates `sum('#list .amount')` over the remaining inputs and formats the total.

Trace of `Add row`: `#row-tpl` is a bare ref → resolved to the `<template>` → host checks `tpl instanceof HTMLTemplateElement` (the `adopt` slot) → `listable.adopt(e, tpl)`. Point it at a `<div>` and the host logs `expected HTMLTemplateElement, got HTMLDivElement` and aborts the chain; write `'#row-tpl'` in quotes and it is a string, rejected the same way.

### 9.2 Order form: the asynchronous seam

```html
<form is="interactable-form" id="order" novalidate
      implements="prevent-default validatable requestable"
      requestable-url="/api/orders" requestable-method="post"
      requestable-target="#receipt"
      requestable-after="#receipt.show(); #alert.hide()"
      requestable-error="#alert.show()"
      on-submit="this.validate().send()">
  <input name="qty" type="number" min="1" required>
  <button>Place order</button>
</form>

<section is="interactable-section" id="receipt" implements="revealable" hidden></section>
<div     is="interactable-div"     id="alert"   implements="revealable" hidden role="alert">Couldn't place the order.</div>
```

The form is the receiver of both verbs because a phrase has one receiver (rule 3), and it is the right one: the form is what validates and what sends, and it already knows how to serialise itself (`new FormData(el)`). The trigger is `on-submit`, not a click on the button, so Enter in the field and the button produce the same one event. `prevent-default` with no config derives `submit` from `<form>` (§5.5). Everything about "later" (what to hit, where the response lands, what runs on success, what runs on failure) sits on the element that owns the request.

There is deliberately no `this.reset()` in `requestable-after`. None of the form's three implementations owns `reset` (`modifiable` does not list `form` in its tags), so the executor would log `no implementation on form#order handles reset()`; the trace below shows exactly that path. If the form should clear after success, either let the server's response replace it (`requestable-swap="outer"`, the HTMX way: the next state comes from the server) or give the form an implementation that owns `reset`; the document does not invent one for the example.

`novalidate` is load-bearing. Without it the browser's interactive validation runs first and, for an invalid form, never fires `submit` at all; the guard would be unreachable and always true when reached. `novalidate` disables only that interactive step; the constraint API stays, so `reportValidity()` still shows the native bubble on the offending field. The phrase decides *when* validation happens; the platform still decides *what* valid means.

`validatable` is nearly nothing, which is what a guard verb should be:

```ts
export const validatable = defineImplementation("validatable", {
  tags: ["form", "input", "select", "textarea"],
  verbs: { validate: "undefined" },
}, (el) => ({
  validate: (e) => { if (!el.reportValidity()) e.preventDefault(); },   // the browser shows the bubble; we translate false → stop
}));
```

The core of `requestable` (config and swap details elided):

```ts
(el, attrs) => {
  let inflight: AbortController | undefined;
  const method = () => attrs.method ?? "get";
  const policy = () => attrs.concurrency ?? (method() === "get" ? "latest" : "first");   // derived, §6.1 / §8.6
  const settle = (status?: "error") => { inflight = undefined; attrs.status = status; el.ariaBusy = null; };

  return {
    abort: () => { inflight?.abort(); settle(); },
    send: (e) => {
      if (inflight) {
        if (policy() === "first") return;                 // refuse; the earlier request wins
        if (policy() === "latest") inflight.abort();      // supersede
      }
      const ctl = (inflight = new AbortController());
      attrs.status = "loading"; el.ariaBusy = "true";     // synchronous, before paint: CSS can disable the button from this
      fetch(url(el, attrs), init(el, attrs, ctl.signal))
        .then(async (res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const html = await res.text();
          if (ctl !== inflight) return;                   // superseded under "all"
          swap(el, attrs, html);
          settle();
          if (attrs.after && el.isConnected) runPhrases(el, attrs.after, e.originalEvent);   // this = el
        })
        .catch((err) => {
          if (err.name === "AbortError") return;          // cancelled: not an error, no phrase
          settle("error");
          if (attrs.error && el.isConnected) runPhrases(el, attrs.error, e.originalEvent);
        });
      // no return value: the verb is synchronous and the chain is complete
    },
  };
}
```

Traces:

- **Happy path.** Enter in `qty` → `submit`. `prevent-default` cancels the navigation on its own listener. `on-submit` → `runPhrases(form, "this.validate().send()")` → `validate`: `reportValidity()` true → `send`: no inflight, controller created, `data-status="loading"`, `aria-busy="true"`, fetch started, returns. Chain complete; two dispatches, well under a frame. Later, 200: response swapped into `#receipt`, `settle()`, then `runPhrases(form, "#receipt.show(); #alert.hide()")`; the receipt reveals and any earlier failure alert is cleared.
- **Validation fails.** `qty` empty; because of `novalidate` the `submit` event fires anyway. `reportValidity()` returns false and shows the browser's bubble on the field; the verb calls `e.preventDefault()`, the executor stops before `send`. No request, no status change, nothing logged.
- **Double submit.** Second `submit` 100 ms later: `validate` passes, `send` sees `inflight` and the POST policy is `first`, returns. The button was already inert from `form[aria-busy="true"] button { pointer-events: none }`. `after` runs once.
- **Server 500.** `res.ok` false → catch → `settle("error")` → `data-status="error"` → `runPhrases(form, "#alert.show()")`. Values kept, button re-enabled, alert shown; the user retries.
- **A verb throws.** Say a `#receipt.render(this)` in `after` hits `tpl.content.firstElementChild!` null. The host catches, sets `e.error`, the executor logs once with receiver and verb and stops that chain. `#alert.hide()` is a separate `;` phrase and still runs, which is what `;` promises. Before `e.error`, `dispatchEvent` would have swallowed the throw and the chain would have continued as if the verb had succeeded.
- **Nobody handles it.** `requestable-after="#receipt.show(); this.reset()"`: the first phrase runs; `reset` dispatches to the form, none of `prevent-default`, `validatable`, `requestable` owns it, `handled` stays false, executor logs `no implementation on form#order handles reset()`. A typo (`sned()`) takes the same path. This is the case that was silent under a single return channel.
- **Response replaces the form.** `requestable-swap="outer"` with no `target`: the swap removes `#order`, its host disconnects, `el.isConnected` is false, `after` is skipped. The new form carries its own attributes and upgrades on insertion.

---

---

## 10. Decisions

**10.1 Do not use the `command` attribute or event.** The browser owns `command`/`commandfor` and the `command` event (Baseline 2025, six built-in verbs). Using our own attribute (`on-*`) and event (`interaction`) means no negotiation with native verb names, no deferral table, no double dispatch on `<dialog>`, and no loss: native invokers and Interactable coexist on the same button (`commandfor="dlg" command="show-modal" on-click="#log.track()"`). Extending the native API instead is examined in Appendix C.

**10.2 `on-` prefix.** This is a single-consumer tool; ecosystem collisions (Vue/Alpine `@`, JSX prop names, XHTML) don't apply. `on-` reads naturally. Accepted cost: CSP scanners and linters that pattern-match `on*` may produce noise.

**10.3 One attribute per event, not one attribute with an event grammar.** Readability at scale, a busy element reads like any multi-attribute element, and it deletes the default-interaction table entirely. Cost: no "one verb on two events" shorthand; write two attributes.

**10.4 Receiver first, dot, parens.** `#pop.show()` is member access, and that is semantically honest: the element has `show` because it implements `revealable`. It completes from the left (`#pop.` → verbs), mirrors the TypeScript DSL, is a shape models produce reliably, and makes chains uniform. Cost: `#pop.show` looks like CSS to a CSS reader; the mandatory parens are the tell.

**10.5 Arguments on the call.** This is the `value` payload the old spec deferred, placed where it has no list-alignment problem. Literals, refs, three property reads off a ref, and a flat object literal of those: no expression language, so the DSL stays lintable, completable and safe to hand to a model. Shape of the argument: 10.21.

**10.6 Postfix modifiers, whole-phrase scope.** Mirrors the DSL. Mid-chain modifiers are ambiguous ("debounce between set and inc"), so they are forbidden; a phrase that wants a modifier on one link is two phrases.

**10.7 `;` independent, `.` sequential and abortable.** Two separators with two meanings, which is what justifies keeping both. Abort via `preventDefault()` is the guard-verb mechanism.

**10.8 `once()` consumed on completion; one receiver per phrase.** `validate().send().once()` means "send once, after validation passes"; native `{ once: true }` semantics would spend it on the first failed validation. A phrase addresses exactly one receiver; `;` says "and also this one". A group form is discussed in Appendix C.

**10.9 No class or selector receivers.** Classes are global by default; the fix is scoping; scoping is a selector language; a selector language is jQuery. Containers + scoped selector *arguments* cover the dynamic-set case with the receiver graph still 1:1.

**10.10 No invented events (`on-swapped`, `on-changed`).** A second vocabulary to remember for a rare case. Follow-up after asynchronous work is the responsibility of the implementation that performed it, through its own continuation phrases (`requestable-after`, §8.6, 10.31); there is no event to listen for because the implementation already knows the moment.

**10.11 Attributes are variables; verbs write, callbacks render.** Uses `observedAttributes` / `attributeChangedCallback` as [`auto-wc`](https://github.com/AceCodePt/auto-wc) and the platform already provide them. Nothing new to build; the rule is a convention in the implementation-authoring guide.

**10.12 No `isTrusted` gate.** Untestable from JS and makes `element.click()` inert. The event type does the separation now.

**10.13 Single repo, no separate engine bundle.** Parser, executor, event, host, implementations and CLI share one package. The parser and executor are imported by the host and ship inside `interactably-core.js`; there is nothing to load "before" anything else. A two-repo split is examined in Appendix C.

**10.14 The baseline this has to beat.** For a single consumer, `onclick="$('#pop').show()"` with a three-line `$` is a legitimate alternative. The DSL earns its parser on four things: key/timing modifiers without branching in handlers; a receiver that can intercept and abort; static tooling (verb completion per receiver, missing-id and unknown-verb errors before the page loads); and CSP compatibility. If none of those matter, the shim is the correct design.

**10.15 Triggers are hosts, not delegated.** A trigger is a customized built-in exactly as a receiver is, and it binds its own listeners in `connectedCallback`. Bubbling and capture are then irrelevant, passive is a per-element flag, cleanup is free, and the host is the single place where anything about an element is decided, on the trigger side and the receiver side alike. Cost: `is=` on every trigger (or the auto-loader), and the Safari polyfill covers more elements. Document-level delegation, which would have spared triggers the `is=`, is examined in Appendix C.

**10.16 `this` for the trigger.** `this` is the word inline handlers have bound to the element for thirty years. Under 10.15 the listener is bound to the element itself, so `this` in the DSL means exactly what `this` means in `onclick="this.value=''"`: no delegation mismatch. It reads as a noun in the receiver slot, resolves locally for tooling, and serves as an argument, so one word covers both uses. The asymmetry with `$value` / `$checked` is honest: those are values pulled off the trigger; `this` is an element reference, the `#id` family's sibling. Boundary: `this` is a reference, not an object with a DOM API (§3.3 rule 10). Alternative spellings: Appendix C.

**10.17 Cache the parse, resolve per fire.** `this` and `#id` stay tokens in the cached AST and bind at dispatch. Text-substituting `this` into a generated `#id` would mutate the DOM, break the parse cache across identical rows, and reintroduce per-element state.

**10.18 No implicit innermost-wins for nested triggers.** Every trigger binds its own listener, so an innermost-wins rule would require each host to run `ev.target.closest('[on-<type>]') !== this` on every event, a DOM walk per trigger per event, added solely to suppress the outer phrase in the rare case where two triggers nest. That is a second, invisible propagation mechanism sitting next to an explicit one the library already has: the `no-propagate` implementation stops bubbling on demand, on the element where it matters (§5.5). The platform's own inline handlers fire both inner and outer, so matching that is the least surprising default, and anyone who wants the inner to win says so on the element where it matters. Implicit suppression would also have bitten non-Interactable listeners in the same subtree if implemented via `stopPropagation`, and would have made a trigger inert whenever a descendant carried the attribute without being upgraded. Rule: nesting bubbles; suppression is opt-in and explicit.

**10.19 [tsyntax](https://github.com/AceCodePt/tsyntax) strings are the signature language; there is no validator-transform layer.** Every `config`, `state` and verb scalar signature is a tsyntax string, and the same string is the TypeScript type and the runtime check. A second schema vocabulary would duplicate it, and a transform step would re-express it into a consumer's own schema library — both unnecessary for a single-consumer tool. What the project needs is exactly two things (a TypeScript type for every attribute and argument, and a runtime check of the value) and tsyntax gives both from one string, in the syntax the author already knows, at 3.6 KB. `"'ltr' | 'rtl' | undefined"` is validated as a string by `tsc`, inferred to a union type, and checked at runtime by the same grammar. Coercion is deliberately *not* in tsyntax: our parser types every literal from syntax, so only `$value` needs a one-step retry, and that lives in `signature.ts` (§8.2). Elements are not in tsyntax either (§10.23). Cost: a second AceCodePt repo in the dependency graph; a signature language limited to scalars (which is the size of our argument grammar anyway); and `'|'` inside a quoted literal is not expressible in a signature (documented tsyntax limit, irrelevant for verb arguments).

**10.20 Tags type the element and gate `implements`.** An implementation declares the tags it attaches to as strings (`["textarea", "input"]`), and `HTMLElementTagNameMap` turns that into the factory's `el` type: a union when there are several, `HTMLElement` when the list is omitted. The same list serves three consumers with no second declaration: the factory body (members common to the union are reachable without casts), the host at connect (a tag not in the list makes that `implements` entry a no-op with a warning), and the registry (it ensures an `interactable-<tag>` host exists for every listed tag, idempotently, so two implementations sharing a tag share one host class). The inversion is deliberate: the union *widens* what the factory may use and *narrows* where the implementation may sit. Generic implementations (logging, `no-propagate`) omit `tags` because a specific element type would be a lie about what they need. Cost: a tag-less implementation cannot rely on the registry to define its hosts; those come from the page or the auto-loader, as today.

**10.21 One argument per verb: a scalar or an object literal.** Positional argument lists were rejected because the binding between position and meaning lives in schema insertion order, which TypeScript cannot see in HTML: inserting an argument in the middle of a tuple silently re-binds every call site in every page. A verb therefore takes exactly one argument. When the signature is a string, the argument is a scalar written positionally (`set(5)`, `transform('upper')`, `removeRow(this)`) because a single argument has no order to get wrong and naming it would be noise (`set(value: 5)`). When the signature is a record, the argument is an object literal with those keys (`setAttr({name: 'aria-expanded', value: 'true'})`) which is what every JavaScript author already writes for named arguments, so it is not a second calling convention; and the handler's `{ name, value }` destructure mirrors the markup character for character. A key whose signature admits `undefined` may be omitted from the literal (`send({method: 'delete'})` is legal when `body` is `"string | undefined"`); a key that does not admit `undefined` is required and a missing one is a dispatch error. The two forms are not a choice the author makes per call: the schema's shape *is* the rule. A verb that grows from one argument to two changes its signature from string to record, and every existing `transform('upper')` becomes a reported parse error rather than a misbinding: a loud, mechanical migration. Objects are one level deep with scalar values, matching tsyntax's scalars-only line. Cost: the tokenizer tracks brace depth alongside quote and paren depth when splitting on commas; a few more characters in the multi-argument case.

**10.22 One declaration site: a static signature table plus a factory of bodies.** Two ways of collapsing a verb's shape to one site were considered. (a) Signatures inside the factory (`set: verb("string", fn)`): one site, but the host must run the factory against a detached element at registration to learn the verbs, and factories legitimately touch `el`. (b) A static `verbs` table above the factory, the factory supplying bodies only. With signatures as tsyntax strings, (b) wins outright: the table is pure data, so it serialises for editor tooling with nothing executed, and TypeScript checks the factory against it in both directions: missing verb, undeclared verb, wrong parameter type. The two places are the `.d.ts` and the implementation, not a duplication of meaning. The call is named `defineImplementation` for what it makes; name uniqueness is the registry's concern at registration time, not the definition's.

**10.23 Element slots are constructors, not a tsyntax keyword.** tsyntax is a scalar language, and its runtime check for a registered keyword is `typeof`, which cannot tell a button from a template. The grammar already knows a bare `#id` / `this` is an element and the executor has already resolved it, so the only thing left to check is *which* element class, and that is `instanceof`, which a constructor gives for free together with `InstanceType<>` for the handler's parameter. There is no `selector` type either: what makes a string a selector is that the implementation feeds it to `querySelectorAll` on an element it was also given, and that is documented by the record's key (`select`), not by a type. Bare vs quoted stays load-bearing: `#list` is a ref the executor resolves and fails early on; `'#list'` is text handed through untouched. Making them equivalent would either resolve `'.amount'` too (reopening scoping, 10.9) or require the signature to say which strings get looked up, giving the DSL two spellings for one referent.

**10.24 A verb's inputs come from `arg`, never from `e.source`.** `removeRow(this)` hands the verb the same element `e.source` already holds, and the redundancy is intentional, exactly as `set(this.value)` is redundant with `e.source.value`. `this` and the reads off it are projections of the source that the *trigger* chooses to send, so the verb stays ignorant of who triggered it: `set('LGTM')` and `set(this.value)` are the same call from `modifiable`'s side. A verb that reads `e.source` to decide what to act on is coupled to its trigger: it cannot be aimed elsewhere (`#list.removeRow(#row3)` from a button outside the row), it needs a positioned fake source in tests instead of `dispatchInteraction(list, "removeRow", row)`, and its meaning changes when the same phrase is moved to another element. `e.source` and `e.originalEvent` remain available as *context*, metadata about the trigger (`aria-expanded` on the button that opened a dialog, the gesture type in a log line), which is the one use that does not couple.

**10.25 Declare only invented information; `attrs` is a parameter.** `modifiable` declaring `min` would be redundant on `<input>`, where `el.min` is already typed and validated by the browser, and fictional on `<textarea>`, which has no `min` and would gain a meaningless attribute. Reading a platform attribute is not declaring it. So there is no category of shared or platform attributes in a declaration: whatever the platform owns is read off the element (narrowed by `tags` and, if needed, `el.type`), and the declaration lists only what the implementation *brings*: its authored `config`, prefixed and collision-free, and its rare invented `state`. `attrs` remains a typed proxy over those, built by `bindAttributes` from the same compiled slots verbs use, and a factory parameter rather than properties on `el` (which already carries `min`, `step`, `open`) or on `this` (absent in the factory body and in arrow-function verbs). Declaring platform attributes, and splitting declarations into public and private, are examined in Appendix C.

**10.26 Three tiers; config is read-only; invented live state is `data-*`.** The platform already distinguishes authored from live for form controls, the `value` attribute is what the author wrote, the `value` property is the current, and that distinction is what makes SSR and hydration free: the markup carries the baseline, the browser derives the live tier from it, the client reconstructs nothing. The convention adopts the same three tiers for everything. `config` is authored input and read-only from an implementation (a verb wanting a baseline of its own keeps it in the closure, as `markClean` does, rather than rewriting the author's attribute). Live state is the platform's property wherever one exists, and `data-<key>` only where none does; one namespace, reflected as `el.dataset`, conventionally data rather than a styling hook. Presentation is derived and written only by the render callback. The consequence for `dirtyable` is that it writes no attribute: dirty is `el.value` against the baseline captured at connect, a comparison it can make on demand; an attribute holding the result would be a cache that can go stale.

**10.27 Strategies are derived, not declared.** `revealable` on `<details>`, `<dialog>`, a popover and a plain `<div>` does four different things, and the first three come with platform machinery (top layer, focus trapping, light dismiss, `::backdrop`, Escape) that a `data-open` attribute would sit dead beside. Rather than four implementations sharing verb names or an author-written `strategy=` attribute, one implementation selects at connect from information already on the element (the tag, `hasAttribute("popover")`) and falls back to invented `data-open` only when nothing else answers. Nobody restates what the DOM already says; this is the same principle that removed `min` from the schema (10.25) and `dirty-state` from the DOM (10.26), applied to behaviour selection.

**10.28 Default actions and propagation are implementations, not executor rules or modifiers.** Three placements were possible for "cancel the browser's default": a table inside the executor keyed by event and tag, a phrase modifier, or an implementation on the element. The table is an implicit mechanism next to an explicit one (`no-propagate` already exists for propagation), and it forces a decision at event time (before debounce, before refs resolve) which is where the contradictions with late binding come from. A modifier is the wrong scope: `debounce`, `throttle` and `once` are legitimately per phrase (one phrase debounced, its neighbour not), but an event has one default action, so a per-phrase flag needs a precedence rule for phrases disagreeing about something that is not theirs. An implementation is event-scoped by construction (its config is a list of events), lives on the element where a reader looks for it, is grep-able, needs no grammar, and is the twin of a file the repository already has. What it gives up is the safe implicit default for `<form on-submit>`, which is recovered as a connect-time warning: explicit in the markup, loud in development, invisible in the executor. The derived default events of `prevent-default` (§5.5) are the old table, relocated to the one place that acts on it.

**10.29 Verbs are synchronous; the asynchronous seam is a continuation phrase.** The alternative, chains that await a verb's promise, was drafted in full before being removed, and every question it raised was a question about the executor: what a second fire does to an in-flight chain, what happens when the receiver leaves the DOM mid-await, whether `once()` is spent while pending, how a rejection propagates, whether latest-wins or first-wins is the default. None of those has a right answer at the executor's level, because they all depend on what the asynchronous work *is*; only the implementation performing it knows whether it is idempotent, whether a cancelled fetch un-does anything, and what "done" means. Making verbs synchronous moves every one of those decisions into the implementation that can make them, and it restores the shape the library set out to reproduce: HTMX's client is synchronous, and time passes on the server. The cost is a one-line story that now reads across two attributes (`on-submit` on the trigger, `requestable-after` on the receiver); what it buys is that the network boundary is visible, named and located on the element that owns it, rather than disguised as one more dot.

**10.30 Three return channels on the event.** `dispatchEvent` returns normally regardless of what listeners do: a listener that throws is reported to `window.onerror` and swallowed, and an event nobody handled is indistinguishable from one that was. Under the single-channel design (`result` only), four failures were silent (a synchronous throw in a verb, `sig.validate` throwing on a bad argument, a verb no implementation owns, and an element missing its `implements`) and in every case `result` stayed undefined, `defaultPrevented` stayed false and the chain continued. The host is the last frame that can catch, so it reports what happened on the event itself: `handled`, `error`, `result`. Two alternatives were rejected. Wrapping every call in an async IIFE would turn synchronous throws into rejections for free, at the price of making every chain asynchronous by a microtask purely for error plumbing (and 10.29 then removed awaiting altogether). Bypassing `dispatchEvent` with a direct host method call would let exceptions propagate naturally, but leaves the event as a second path for tests and external callers that would drift from the first. `preventDefault()` is kept distinct from `error`: a guard declining is not a failure and does not log.

**10.31 Continuation phrases are named per implementation, not by convention.** `requestable-after` and `requestable-error` are config entries `requestable` declares, with names it chose. A library-wide rule, "any implementation may accept `<name>-after`", was considered and rejected: the words are the same but the events are not. An upload failing, a request failing and an animation being interrupted are different things with different follow-ups, and a shared name would suggest a shared meaning the implementations cannot honour. Each implementation that finishes work later declares the moments it exposes, under the names that describe them; the only shared part is the mechanism, `runPhrases`, which every continuation calls.


**10.32 Readiness is reported, never awaited.** The host's implementation loading is synchronous once every implementation is registered and a promise continuation until then. Running `onInteraction` behind that same deferral would reintroduce, through the loader, the exact asynchrony 10.29 removed: `dispatchEvent` would return before the callback ran, the executor would read `handled === false`, and the three channels would describe a chain the host had not yet touched. The DSL's contract is that a dispatch is answered before `dispatchEvent` returns, so the host must answer with what it knows at that instant, and "not yet loaded" is something it knows. Reporting it as a distinct error, rather than queueing the interaction, keeps the contract, keeps the message honest (the implementation exists; it is late), and makes the fix legible: import the implementation before the markup, which is already the recommended path for the same reason the auto-loader is (§8.5). The trigger side has no such dependency and binds synchronously; only the receiver side has a readiness state, and only under the lazy loader.

---

**10.33 Report with `console.error`, throw only at definition time.** Host lifecycle callbacks and event listeners run on the browser's stack, and the browser handles what they throw: `window.onerror`, then carry on. A throw there is therefore not a stronger signal than `console.error`, it is the same signal with collateral damage, because it also abandons the rest of the callback (the element's remaining implementations and `on-*` bindings) or vanishes into `dispatchEvent`. So authoring mistakes with no legitimate reading are `console.error` and the offending item is skipped; things that might be intended are `console.warn`; and `throw` is kept for `defineImplementation` and the registry, whose caller is the developer's own module and where a half-registered definition would be worse than none (§5.1 Reporting).

**10.34 Property reads use the platform's names, not `$value` / `$checked`.** Earlier drafts had two coined keywords, `$value` and `$checked`, that read from the trigger only, plus a coercion retry in `signature.ts` that turned a string `$value` into a number when the signature wanted one. All three are gone. Arguments may read `value`, `checked` or `valueAsNumber` off any ref, with the platform's own types and no coercion. Three reasons. The names are already documented everywhere: anyone who has written a line of DOM JavaScript, and any model trained on it, knows that `value` is a string and that `valueAsNumber` is the typed reader for a numeric input, so the DSL needs no tutorial and the model needs no prompt to pick the right one; `$value` was a token with no prior existence whose type rule had to be taught and would still be guessed at. A read may be aimed at any element, not only the trigger: `#total.add(#qty.valueAsNumber)` from a button was impossible before. And dropping coercion keeps the author's correct mental model correct: if `value` silently became a number on numeric inputs, the person who knew `value` was a string would be wrong in our dialect. The list is closed at three so the grammar never becomes property access in general (rule 11), and the parser tells a read from a verb by the absence of parentheses, which are mandatory on calls.

**10.35 `prevent-default` derives its events from the element's own phrases.** The first draft derived only from the tag (`<form>` → `submit`, `<button>` → `keydown:enter,keyup:space`), so a search box had to write `keydown:enter` twice, once in `prevent-default-events` and once in `on-keydown`, and the two could drift. Now an omitted `prevent-default-events` means "cancel the events I have claimed", read off the `on-*` attributes, for `submit`, `click` and `keydown` only, with a keyed phrase's key carried through. This is safe because most events have no default action to cancel; over-reaching on `input` or a custom event does nothing. It is not the same as implicit cancellation (rejected in 10.28 and again here): `implements="prevent-default"` is still written on the element, so a reader sees that the form does not navigate without knowing any rule. Only the *which* is inferred, never the *whether*. The three-event cap is deliberate: they are the common cases and the ones a model will emit correctly; `contextmenu`, drag and drop, `wheel` and `touchstart` are rare, have coupling (`drop` needs `dragover`) or block scrolling, and are stated. A `<button>`'s fallback moved from its activation keys to `click`, because the activation keys synthesise a click and cancelling only them leaves the mouse path live.

## 11. Out of scope for v1

Shadow DOM · modifier keys and `.self` / `.outside` (reserved as postfix modifiers) · class receivers · property access beyond `value` / `checked` / `valueAsNumber` · dynamic `on-*` attribute names after connect · cross-element watching (`watch()` remains a possible opt-in verb on an implementation, not a mechanism of the system) · a per-trigger `preventDefault` opt-out · nested objects or arrays as arguments · variadic verbs · a template-literal type over a whole `on-*` value (the `verbs` data makes it possible; not needed for v1) · a CLI check that `is="interactable-<tag>"` in markup matches the implementations' declared tags.

---

## Appendix A: Reference grammar

```
attribute := 'on-' event-type
value     := phrase (';' phrase)*
phrase    := [key ':'] ref ('.' call)+ ('.' modifier)*
ref       := '#' id | 'this'
call      := verb '(' [arg | object] ')'
arg       := number | "'" string "'" | 'true' | 'false' | ref | read
read      := ref '.' ('value' | 'checked' | 'valueAsNumber')
object    := '{' field (',' field)* '}'
field     := name ':' arg
modifier  := 'debounce(' ms ')' | 'throttle(' ms ')' | 'once()'
```

Whitespace is insignificant outside string literals. `id` excludes whitespace, `,`, `;`, `.`, `(`, `)`. `name` is an identifier (`[A-Za-z_][A-Za-z0-9_]*`). `this` is a keyword; an element with `id="this"` is addressed as `#this`. Which of `arg` / `object` / nothing a call accepts is decided by the verb's signature (string / record / `"undefined"`), not by the grammar.

Signature language (values in `config`, `state` and `verbs`): a **slot** is either a [tsyntax](https://github.com/AceCodePt/tsyntax) scalar DSL string (`string`, `number`, `bigint`, `boolean`, `undefined`, numeric and quoted literals, template literals, `|` unions) or an element constructor (`HTMLElement`, `HTMLTemplateElement`, …). A verb signature is one slot or a flat record of slots; an attribute signature is one string slot. A record key whose slot admits `undefined` may be omitted from the object literal; any other key is required.

## Appendix B: The `$` baseline

```js
const $ = (sel) => {
  const el = document.querySelector(sel);
  return new Proxy(el, { get: (t, k) => verbOf(t, k) ?? t[k] });
};
// <button onclick="$('#pop').show()">
```

Kept here so the parser always has something concrete to justify itself against.

---

## Appendix C: Alternatives considered

Questions a reader of the body may ask, with the answer and the decision it belongs to. These are designs that were weighed and set aside.

**Why not delegate `on-*` from a document-level engine, so triggers need no `is=`?** (→ 10.15) It buys one property: a trigger works before any script defines a host. It costs a supported-events list with capture/bubble/passive buckets, an ancestor walk per event, a `MutationObserver` to bind non-passive `wheel`/`touch*` listeners on late elements, a `register()` API and an unknown-event error class, and it makes "who handles this event" a question answered somewhere other than the element. Binding in `connectedCallback` deletes all of it.

**Why re-read the `on-*` value at fire time instead of parsing once at connect?** (→ §5.1) The two are indistinguishable for server swaps, since a swapped node is a new node either way. They differ for an attribute edited in place: re-reading makes the edit take effect on the next fire; parsing at connect makes the DOM lie about what the element does unless an observer is added, and per-element observers are what §5.1 removed. Re-reading is also the cheaper code path: no per-element AST storage, and the parse cache makes the per-fire cost a map lookup.

**Why `this.value` rather than a `$value` keyword?** (→ 10.34) Because `$value` had to be learned and `this.value` is already known, by people and by models; because a keyword could only read the trigger while a read can be aimed at any ref (`#qty.valueAsNumber`); and because the coercion `$value` needed (string to number when the signature asked) taught the wrong type. Why not general property access, then? Because `this.parentElement.children.length` is an expression language, and every question about the DSL's safety and lintability rests on there not being one; three platform names with the platform's types is the whole allowance, and parentheses already separate them from verbs.

**Why `this` rather than `$self` or `$source`?** (→ 10.16) `$self` is a coinage. `$source` reads as a value keyword, but it denotes an element, and the DSL already has a family for elements: `#id`. `this` is the inline-handler word for exactly this element, needs no explanation, and works in both the receiver slot and the argument slot, so one word replaces two.

**Why is there no key list, `enter, numpadenter: #f.send()`?** (→ rule 4) For the same reason there is no group receiver. It is one phrase standing for two, and every per-phrase mechanism then has to decide whether it is one or two: does Enter spending `once()` spend NumpadEnter, does the debounce timer merge them, does an error on one skip the other? The coherent answer to each is "they are two phrases", and `;` already writes that.

**Why is there no group receiver, `(#a, #b).hide()`?** (→ 10.8, rule 3) Because the chain aborts per receiver, `(#a, #b).send().once()` has to track `once` per receiver (`#a` completes and is spent, `#b` aborts and stays live) which makes the group form exactly `#a.send().once(); #b.send().once()` with a second spelling and a bookkeeping key of (phrase, receiver index) that has to survive `#b` being replaced in the DOM. A shorthand that needs a paragraph is not a shorthand; `;` already says "and also this one".

**Why not innermost-wins when triggers nest?** (→ 10.18) Under document delegation "first matching ancestor" is free; with per-element listeners it is a `closest()` walk per trigger per event, added solely to suppress the outer phrase in the rare nested case, and implemented via `stopPropagation` it would also silence non-Interactable listeners in the subtree. Inline handlers fire inner and outer; matching that is the least surprising default, and `no-propagate` on the inner element is the explicit opt-out.

**Why not positional argument lists, `transform('upper', 2)`?** (→ 10.21) The binding between position and meaning lives in schema order, which nothing in HTML can see: inserting an argument in the middle silently re-binds every call site in every page. One scalar or one object literal makes a signature change a loud parse error instead.

**Why not declare signatures inside the factory, `set: verb("string", fn)`?** (→ 10.22) One site, but the host must run the factory against a detached element at registration just to learn the verbs, and factories legitimately touch `el`. A static table above the factory is pure data: serialisable for tooling, checked against the factory in both directions by TypeScript.

**Why not `element` and `selector` as [tsyntax](https://github.com/AceCodePt/tsyntax) keywords?** (→ 10.23) tsyntax validates registered keywords with `typeof`, which cannot distinguish a button from a template; an element slot needs `instanceof`, which a constructor gives for free. And nothing makes a string a selector except that an implementation feeds it to `querySelectorAll`; that is documented by the record key, not a type.

**Why doesn't `modifiable` declare `min` and `max`?** (→ 10.25) Because `<input>` already has them, typed, as `el.min` / `el.max`, and `<textarea>` does not have them at all; declaring them would be redundant on one tag and fictional on the other. A declaration lists what the implementation brings; platform attributes are read, not declared.

**Why not split declarations into shared `attributes` and prefixed `private`?** (→ 10.25) Once platform attributes are read rather than declared, there is nothing left to share: every declared name is the implementation's own, so every declared name is prefixed (`config`) or `data-*` (`state`), and the split has no members on one side. A connect-time owner map, first implementation in `implements` order wins a contested unprefixed name, was also considered and rejected as a runtime rule for a static fact.

**Why not `data-dirty` (or `dirty-state`) on `dirtyable`?** (→ 10.26) Dirty is `el.value` compared with the baseline the implementation captured at connect, a comparison it can make on demand; an attribute holding the result is a cache that can go stale.

**Why doesn't the executor cancel the native default for `<form on-submit>` and `<a href on-click>`?** (→ 10.28) A table in the executor is an implicit mechanism next to the explicit one the repo already has for propagation, and it has to decide at event time, before debounce and before refs resolve, which is where it collides with late binding (should a missing `#id` fall back to native submission? cancel a submit that then dispatches nothing?). Moving cancellation to `prevent-default` removes the decision rather than answering it; the connect-time warning keeps the forgetful case loud.

**Why not make `on-submit` cancel the submit by itself?** (→ 10.35) Because then whether a form navigates would depend on knowing the rule, not on reading the markup. With `implements="prevent-default"` stated, the cancellation is visible on the element; if a project wants it everywhere, its templates emit it everywhere. Deriving *which* events to cancel from the phrases removes the duplication without hiding the decision.

**Why not `.prevent()` / `.native()` / `.stop()` as phrase modifiers?** (→ 10.28) `debounce`, `throttle` and `once` are per phrase and legitimately so. An event has one default action and one propagation path, so a per-phrase flag for either needs a rule for what happens when phrases disagree about something that is not theirs, the tell that the slot is wrong. Event-scoped statements belong on the element, and `no-propagate` / `prevent-default` are exactly that.

**Why not extend the native Invoker Commands API: `commandfor`/`command` plus parallel `commandby` lists, custom `--` verbs, a subclass of the `command` event?** (→ 10.1) Sharing the attribute and event with the browser forces a `--` prefix negotiation so custom verbs cannot collide with present and future built-ins, a table saying which native defaults to defer to, an `originalEvent`-presence convention to tell native from synthetic dispatch, and a double-dispatch risk on `<dialog>` where both the browser and the library act on `show-modal`. Index-aligned parallel lists (`commandfor="a b" command="x y"`) are a DX hazard on their own. An attribute and event the browser does not know about have none of these problems and cost nothing the native API would have provided.

**Why not two repositories, engine and implementations?** (→ 10.13) The parser and executor are imported by the host and ship inside the same bundle; there is nothing to load before anything else, and a second repo is a second release cadence for one consumer.

**Why not autonomous wrapper elements instead of `is=`?** (→ 8.5) They would fix Safari's asynchronous upgrade, at the price of losing form participation, native semantics and existing CSS on every element, for every engine.

**Why don't chains await a verb's promise, `#results.send().highlight()`?** (→ 10.29) Because every question it raises (a second fire mid-flight, a receiver removed while awaiting, whether `once()` is spent while pending, latest-wins versus first-wins) is a question only the implementation doing the work can answer, and the executor would have to guess. Verbs are synchronous; an implementation that finishes later runs a continuation phrase from its own config. The network gap becomes a named attribute instead of an invisible dot.

**Why not let the executor abort the previous chain when the same phrase fires again?** (→ 10.29, §8.6) Aborting a `fetch` does not undo what the server did with it. Latest-wins is right for an idempotent GET and wrong for a POST; the executor cannot tell them apart, `requestable` can, and derives the policy from the method.

**Why `handled` and `error` on the event rather than exceptions?** (→ 10.30) Because `dispatchEvent` swallows listener exceptions and returns normally, so a `try/catch` in the executor never sees a synchronous throw, and an event nobody handled looks identical to a handled one. An async wrapper would fix throws by making every chain asynchronous; a direct method call would fix them by adding a second dispatch path. Fields on the event fix them with no change to either.

**Why not a general `<name>-after` convention for every implementation?** (→ 10.31) The word is shared, the event is not: a request failing and an upload failing call for different follow-ups. Each implementation names the moments it exposes; only `runPhrases` is shared.

**Why not queue an interaction until the lazily loaded implementation arrives?** (→ 10.32) Because the queue is a waiting chain, and the host would answer the event after `dispatchEvent` returned, when the executor had already read the channels and moved on. The host reports `NotReadyError` synchronously instead; with implementations imported before the markup the case never occurs.
