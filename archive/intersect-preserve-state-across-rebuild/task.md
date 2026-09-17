---
wait_human_start: false
wait_human_merge: false
dependencies: []
---

# Task: Fix intersect losing enter/leave/full state when a referenced margin rebuilds the observer

## Metadata

- **Complexity:** Low
- **Priority:** High
- **Status:** Ready for Handoff

## Context

On the docs site a section scrolled under the sticky header keeps its sidebar link lit: on-intersect-leave never fires for it. Every section carries `-#topnav.height 0px 0px 0px:` on both phrases, which parses, resolves, and constructs correctly. In registry/interactable/intersect.ts, syncIntersect (l.60-110) keeps the enter/leave/full transition state in closure locals `wasOverlapping`/`wasFull`. When #topnav reports a resize, the registered listener calls syncIntersect again; the resolved margin differs, so teardownIntersect disconnects the old observer and a new one starts both booleans at false. The new observer's initial report for a section the old observer had reported as entered, now no longer overlapping, computes `left = false`, so no leave fires and the data-visible attribute is never removed. Any change to the referenced element's rounded height triggers it (web font swap, resize that rewraps the nav, opening devtools). The same loss applies to `full`. Baseline origin/main = c9c7251; follows task-intersect-and-height.md (aa7f6c7, d7f76e4, dd9a0b3, 96c78a8).

## Requirements

- [ ] `ManagedObserver` in registry/interactable/intersect.ts gains `state: { wasOverlapping: boolean; wasFull: boolean }`; the callback closure mutates that object instead of two local variables, and the object is stored on the managed observer.
- [ ] In `syncIntersect`, when constructing each new observer after teardown, seed `state` from the predecessor: `existing?.get(key)?.state`, defaulting to `{ wasOverlapping: false, wasFull: false }` only when there was no observer for that key. The map key is the unresolved margin, so a rebuild caused by a new pixel value finds its predecessor.
- [ ] Do not fire `leave` synchronously in `teardownIntersect`; the element may still overlap under the new margin and only the rebuilt observer's initial report knows.
- [ ] A section that stays overlapping across the rebuild emits no event; one that no longer overlaps emits exactly one `leave`; a `full` that was true and becomes false emits one `full` transition.
- [ ] A rebuild caused by an attribute edit that adds a new margin key leaves the surviving key's state intact and starts the new key from `{ false, false }`.
- [ ] Add four tests to registry/interactable/intersect.test.ts using the fake ResizeObserver in tests/resize-observer.ts, covering the leave-on-rebuild case, the no-event-still-overlapping case, the full-true-to-false case, and the added-key case. Test count must not go down.

## Verification

`pnpm check` passes and `pnpm test` passes with the four new tests present and no reduction in total test count. Specifically the new test asserts: after an enter on a `-#nav.height 0px 0px 0px` margin, a nav resize to 74 rebuilds the observer with rootMargin `-74px 0px 0px 0px`, and the rebuilt observer's first non-overlapping report produces exactly one `leave` and no second `enter`.

## Prohibited Patterns

- Firing `leave` (or any event) inside `teardownIntersect`, because the element may still overlap under the new margin and the new observer's report is the only thing that knows.
- Reusing a bare boolean rather than per-key state, which would let one margin key's state leak into another on a rebuild that adds or removes keys.
- Changing behavior or signatures outside registry/interactable/intersect.ts and registry/interactable/intersect.test.ts; the site/* working-tree edits are unrelated and must be left untouched.
- Creating or writing scratch files under /tmp or any system temp directory.
