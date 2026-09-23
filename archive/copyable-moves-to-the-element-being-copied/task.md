---
wait_human_start: false
wait_human_merge: false
dependencies: [event-value-binding]
---

# Task: copyable moves to the element being copied

## Metadata

- **Complexity:** Medium
- **Priority:** Medium
- **Status:** Ready for Handoff

## Context

copyable declares tags: ["button"] and takes the element to copy as the verb's argument, so the implementation sits on the button while its copy event fires on the button — an element that was never copied from. That contradicts the platform: the native copy event fires on the element the copied selection is in, not on whatever triggered the copy. On a button, on-copy is genuinely ambiguous about which of the two events an author meant. The name lies too: on a button copyable reads as "this button can copy things"; on the text it reads as "this text can be copied", which is what the word means and what every other implementation name does — dirtyable, revealable and the rest describe the element they are on. The implementation moves to the element being copied; the button calls it as an ordinary receiver (#snippet.copy()), which is already how the library works. copy fires on the copied element only after the write has succeeded, copy-error on total failure, and the docs record copy's sharing with the native event and why. The executor's contract is untouched: executor.ts contains no await, a verb returning a promise is not awaited, so the event — not a chain — is the only ordering mechanism for async verbs.

## Requirements

- [ ] copyable sits on the element being copied: defineImplementation("copyable", { tags: ["pre", "code", "p", "div"], events: ["copy-error"], verbs: { copy: "undefined" } }, ...); copy() reads the element's own textContent (the same read and empty check as today) with no argument, and the button calls it as a plain receiver: on-click="#snippet.copy()".
- [ ] copy is not declared in copyable's events: declaring it would make isImplementationEvent(el, "copy") true and bindTrigger's handler (attachment.ts:213) would swallow the native clipboard copy event, breaking the sharing. Instead the success path dispatches a plain Event("copy") on the element only after the write has succeeded (navigator.clipboard.writeText resolves, or the execCommand fallback returns true); the native event and the verb's event both reach the same on-copy phrase. copy declares no values.
- [ ] copy-error fires on total failure — the clipboard write and the fallback both fail, or there is no clipboard API and the fallback fails — dispatched as an ImplementationEvent("copy-error"); declares no values. Declaring copy-error keeps on-copy-error free of the no-such-event warning. Empty text is NOT an error: copy() on an element with no text is a no-op that fires neither copy nor copy-error. No console.warn remains in the copy-failure path.
- [ ] copy() stays synchronous: it kicks off the write and returns undefined (never a promise — the executor warns on promise returns at executor.ts:178); the executor's contract is not changed and a phrase placed after copy() in a chain still runs immediately.
- [ ] The docs record the known sharing: copy on a copyable element catches both the native clipboard event and copyable's success — one fact, one attribute — differing underneath only in cancelability and clipboardData, with the fix (if it ever bites) being a rename to copied, not a redesign. The docs.html Implementation-event construct row (line 230) flips its meaning; README.md:89 and the reference.html ImplementationEvent row (line 235) no longer list copy as a purely implementation-declared event; the docs.html:787 "implementations never call verbs on other elements" prose updates copyable's example to copy-error plus the re-dispatched native copy.
- [ ] The Element arg construct rows (docs.html:239, README.md:98) are removed or reframed: #clip.copy(#snippet) is no longer a legal call and, after this change, no implementation verb accepts an element argument.
- [ ] Every call site under site/ migrates: each .copy-btn block across index.html, reference.html, docs.html and all site/examples/*.html moves implements="copyable" onto the target <pre id="...">, the button drops copyable, keeps attributable (or none where there is no flash), gains an id, and calls #<target>.copy(); the flash phrase is authored on the copied element's on-copy pointing back at the button (#<button-id>.setAttr({name: 'data-copied', value: 'true'}).delay(1500).removeAttr('data-copied')). Embedded markup that shows the old pattern — docs.html:975 (no-propagate), :194, :1004 (copy-flash), and copy-snippet.html's live demo, lede paragraph and embedded block — is migrated too; the copy-snippet examples.html tag chip stays.
- [ ] Four-homes parity: the docs.html copyable table row (line 519), the reference.html copyable card (lines 195–205), the README.md copyable row (line 147) and the index.html chip all describe the new semantics — hosts pre/code/p/div, verb copy() with no argument, events copy and copy-error, and the native-event sharing.
- [ ] registry/behaviors/copyable/copyable.test.ts is rewritten: copy() on the copied element writes its own text; success dispatches copy and runs on-copy with this bound to the copied element; a native copy event on a copyable element does run on-copy (the current shadowing test at :172 inverts); failure fires on-copy-error and never on-copy, with no console.warn; empty text fires neither event; the flash pattern marks the button via a back-pointer; copy() returns no promise.

## Verification

On the committed tree: pnpm run build then pnpm test and pnpm run check all pass. Concretely: the copyable suite has no test asserting copy() takes an element argument or fires copy on the button, and has tests asserting the copied element's own on-copy runs on both a successful verb copy and a native copy, on-copy-error runs on total failure with no console.warn, and empty text fires neither event; no page under site/ contains implements=\"copyable\" on a button or copy(#id); the four-homes parity test in tests/site-smoke.test.ts stays green and the docs body still loads without console.warn/error (jsdom's elements carry oncopy, verified).

## Prohibited Patterns

- Do not declare copy in copyable's events (it would shadow the native event and break the sharing), and do not change the attachment.ts/events.ts shadowing rule to accommodate copyable.
- No executor change: no await, copy() returns synchronously, and a phrase after copy() in a chain must not wait for the write.
- No value declarations on copy or copy-error (no parenthesised on-copy(...) form).
- No console.warn in the copy-failure path; empty text is a no-op, not an error event.
- No HTMLElement argument on copy() and no button in tags.
- No /tmp scratch work; any scratch lives in <repo>/scratch/ and is deleted before finishing.
- No code comments unless requested.
