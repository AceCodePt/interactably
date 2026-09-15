---
wait_human_start: false
wait_human_merge: false
dependencies: [remove-is-guard-verb]
---

# Task: Drop `is` from README and site docs

## Metadata

- **Complexity:** Low
- **Priority:** Medium
- **Status:** Ready for Handoff

## Context

`is()` is being removed from modifiable. The docs must stop advertising a dead verb and record the design decision. The guard-verb prose in the README (rule 6 at line 169, the `preventDefault()` bullet at 201, the `||` guard-only notes at 146/531) is still correct — `validate()` remains the canonical guard — but the place guards are introduced needs one sentence codifying why there is no general comparison in the grammar. Beyond the brief, site/reference.html and site/docs.html carry the same stale `is()` mentions and must be updated too.

## Requirements

- [ ] README.md modifiable row (~line 258): remove `is` from the verb list and delete the trailing "`is({op, value})` is a guard verb…" clause.
- [ ] README.md rule 6 (~line 169), where guards are introduced: add the sentence "Guards are verbs owned by an implementation that knows the rule; the grammar has no general comparison, by design."
- [ ] README.md "What this rules out" table (near line 594): add a row "a value comparison in the attribute (`is`, `if`, `==`) — the rule belongs to an implementation; use `validatable`'s constraints or write a verb."
- [ ] site/reference.html (~line 44): remove the "`is()` is a guard verb that compares the element&rsquo;s value" clause from the modifiable blurb.
- [ ] site/docs.html (~line 394): remove `is` from the modifiable verb list and the same guard clause in the implementations table.
- [ ] Rule 6, the `preventDefault()` bullet and the `||` guard-only notes (lines 169, 201, 146/531) stay correct as written — `validate()` remains the canonical guard; only the added sentence and the removals above change.

## Verification

`pnpm check` passes. `rg -n "is\\{" README.md site/reference.html site/docs.html` and `rg -n "guard verb that compares" README.md site/` return nothing. The modifiable row in README, reference.html and docs.html no longer lists `is`.

## Prohibited Patterns

- Do not touch registry code or site/examples.html in this task — the age-gate example rewrite is a separate task.
- Do not reword the existing guard-verb prose (rule 6, `preventDefault()` bullet, `||` notes) beyond adding the one new sentence.
