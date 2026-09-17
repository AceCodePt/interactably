---
wait_human_start: false
wait_human_merge: false
dependencies: []
---

# Task: delay is a fixed offset, not a debounce

## Metadata

- **Complexity:** Medium
- **Priority:** High
- **Status:** Ready for Handoff

## Context

Review-2 design item C. The review called the re-fire behaviour of a paused chain undocumented; it is documented three times (README.md:253, 339, 672-679) and it is wrong. scheduleResume (executor.ts:248-262) stores every pause under one key per phrase (pauseTimerKey(state.key)) in the per-element timers map, clearing whatever was there — so a re-fire that reaches a delay cancels the earlier chain's pending remainder and restarts the clock. That is debounce behaviour, identical to scheduleDebounce under chainKey, but delay(ms) means a fixed offset: re-fires stack, each remainder runs, two can be pending at once. Verb-set e.pauseMs is the same offset contract; coalescing belongs to the implementation that owns the I/O (README:707). The copy-flash examples (README l.672-679 and 20 copy buttons in site/docs.html) lean on the bug; they are rewritten to the two-phrase form `this.setAttr({...}); this.debounce(1500).removeAttr('data-copied')`. The review file interactably-review-2.md does not exist in this repo, so the "append a line to item C" step is dropped.

## Requirements

- [ ] executor.ts: add `pending: Set<ReturnType<typeof setTimeout>>` to ElementPhraseState; scheduleResume only schedules — create the timer, pending.add(timer), the callback deletes itself from pending then walks; no key, no lookup, no clearTimeout of anything else
- [ ] executor.ts: clearPhraseState clears every timer in pending as well as every value in debounceTimers; disconnect still drops all pending work
- [ ] executor.ts: delete pauseTimerKey; rename timers to debounceTimers so the next reader doesn't re-merge the two scheduling mechanisms
- [ ] executor.ts: scheduleDebounce, throttle and once are unchanged; add a comment at the pending.add noting spentOnces is an array on the per-walk WalkState, so two remainders in flight do not share cursor or gate state
- [ ] executor.test.ts: rename l.694 to "delay(): two fires inside the window run twice" — #m.delay(20).after() fired at t=0 and t=10; at t=60 order is ["after","after"]; this test fails today
- [ ] executor.test.ts: add "delay(): remainders keep their own arguments" — #m.delay(20).set(this.value) with this.value changed between the two fires; both values arrive, in order (refs late-bound at resume)
- [ ] executor.test.ts: add "delay() then once(): both waits run, one call passes the gate" — a counter verb before the once, show after; two fires → counter 2, show 1
- [ ] executor.test.ts: extend the l.569 pauseMs test ("an implementation may still set e.pauseMs to defer the rest of the chain") to two fires producing two resumes
- [ ] executor.test.ts: extend the l.682 clearPhraseState test ("clearPhraseState cancels a pending delay resume") to two pending resumes; neither runs
- [ ] executor.test.ts: the l.670 test "a second click does not cancel once-gated delayed work" stays unchanged and still passes
- [ ] registry/behaviors/copyable/copyable.test.ts:115-133: rewrite the d0311d7 flash test's on-copy to the two-phrase debounce form: this.setAttr({name: 'data-copied', value: 'true'}); this.debounce(20).removeAttr('data-copied')
- [ ] README.md:179 Debounce row appends "a re-fire restarts the timer; one chain in flight"
- [ ] README.md:182 Delay row reads "Pauses the chain where it sits for a fixed ms; re-fires stack, they do not reset it"
- [ ] README.md:253 and 339: replace the "reschedules it (latest wins)" clause with the stacked-remainders text (each re-fire reaching a delay schedules its own remainder; superseding is debounce; a spent once() before the delay leaves the pending remainder to run)
- [ ] README.md:672-679: rewrite the copyable flash example to the two-phrase `this.setAttr({name: 'data-copied', value: 'true'}); this.debounce(1500).removeAttr('data-copied')` form with the "after the last copy" sentence
- [ ] site/docs.html: constructs-table Debounce (l.277) and Delay (l.280) rows mirror the README wording
- [ ] site/docs.html: pipeline prose l.880 adjusted to say delay timers are per-walk pending and dropped on disconnect
- [ ] site/docs.html: all 20 `delay(1500)` copy buttons rewritten to the two-phrase debounce form
- [ ] site/examples.html and site/reference.html are not touched (out of scope)
- [ ] test count in executor.test.ts does not go down (56 existing + renames/reversals and the listed additions → 60)

## Verification

`pnpm check` and `pnpm test` and `pnpm build` all pass on the committed tree. `grep -c 'test("' registry/interactable/executor.test.ts` is 60 or higher. The test "delay(): two fires inside the window run twice" asserts both remainders ran (it fails on the pre-fix code, passes after). The copy-flash example in README and every docs.html copy button uses the two-phrase debounce form. One commit.

## Prohibited Patterns

- Do not alter scheduleDebounce, throttle, or once semantics, or the parser
- Do not touch site/examples.html or site/reference.html
- No code comments beyond the requested pending.add note
- Do not create or edit interactably-review-2.md (the file does not exist in this repo)
- Do not commit in more than one commit
