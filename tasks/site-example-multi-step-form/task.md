---
wait_human_start: false
wait_human_merge: false
dependencies: [validatable-validity-events]
---

# Task: Site example — a multi-step form gated on validity

## Metadata

- **Complexity:** Medium
- **Priority:** High
- **Status:** Ready for Handoff

## Context

The third application-shaped example, after the to-do list and the shop cart, and the page that proves (or disproves) the validity events added by validatable-validity-events. Read that brief first; this page adds no grammar and changes no behaviour.

Its subject is a flow: a form in three steps where a later step is unreachable until the current one is valid, and becomes unreachable again if an earlier step is broken. Nothing on the site shows this. tabs.html and one-panel.html switch between panels that are all equally available; age-gate.html gates on a single input with `on-change="this.validate() && #consent.show()"` and never has to reopen or close the gate.

The stepper is a radio group, not a row of Next buttons. Each radio reveals its step; the later radios begin disabled. The flow is enforced by the control itself, not by hiding a branch — a disabled radio cannot be selected or reached by keyboard, and it stays in the accessibility tree where a hidden step is simply absent. That is the reason this is not a CSS solution: :valid/:invalid and :user-valid/:user-invalid can style, but they cannot set disabled, aria-disabled, or an aria-describedby that tells an assistive-technology user *why* the step is unavailable. The gate is markup state, set by phrases.

Two levels of validity are in play and both must be exercised:
- Form-level, for the gate: each step is a <form implements="validatable">. Its on-user-valid enables the next step's radio and removes the explanation; its on-user-invalid disables the later radios and restores the explanation. Whether fieldset is usable instead of form is settled by the validatable brief — follow what it recorded. Nested forms are illegal in HTML, so three sibling forms plus a confirmation is the expected shape.
- Field-level, for messages: at least one field per step has a message underneath it, revealed by on-user-invalid and hidden by on-user-valid via revealable. This is the case the platform cannot express — there is no native valid event, so without the library's event the message would appear and never leave.

Aggressive versus quiet: use the user- pair for the gate and the messages. Show the aggressive pair (on-valid/on-invalid) in exactly one place where continuous state is the point — a live "step 1 of 3 complete" indicator is the natural candidate — so the page teaches when each pair is the right one. The lede names the distinction.

`validatable-on`: pick `change` for the gate forms (a committed value is when a step should open or close) and consider `input` for the field messages (immediate feedback). Either way say why in the prose; the choice is the author's and the page should model making it.

Closing the gate must be transitive: breaking step one re-disables steps two *and* three, and re-selects step one's radio if the reader was further along, so the visible step is never one they are no longer entitled to. Record how repetitive the markup gets — each step knowing about every later step is a plausible wall.

The final step submits. The site is static: no backend, no request mock, no simulated failure. The submit shows a local confirmation panel and the lede says so, as network-quote and the to-do list name their own constraints.

Findings this page is expected to surface (record each in the handoff with how it was handled or why it could not be):
- Whether the user- semantics — touched and flipped — are right in practice: does a required empty field on step two stay quiet until engaged, and does a restore-installed value behave as the validatable brief promised.
- Whether closing the gate transitively is expressible without each step enumerating all later steps.
- Whether aria-disabled alone is enough or the native disabled is also needed for keyboard behaviour, and what the describedby text should be.
- Whether the aggressive pair firing on every evaluation is noticeable anywhere it is used.
- Anything the to-do and cart handoffs listed that recurs here.

## Requirements

- [ ] site/examples/multi-step-form.html following the established page furniture: topnav, examples-back link, doc-title, doc-lede, demo, and the <details> code block with the copy button. Page ids prefixed (step-) with the snippet free to use short ids.
- [ ] Three steps, each a validatable form with two or three fields, and a radio-group stepper whose later radios begin disabled with aria-disabled and an aria-describedby explaining why.
- [ ] Completing a step (on-user-valid) enables the next radio and removes the explanation; breaking a step (on-user-invalid) disables all later radios, restores the explanation, and returns the reader to the broken step.
- [ ] At least one field per step shows a message on on-user-invalid and hides it on on-user-valid.
- [ ] The aggressive pair used in exactly one place, with prose saying why it is the right pair there.
- [ ] validatable-on chosen deliberately, with the reason in the prose.
- [ ] The lede states the constraints honestly: static site, no backend, local confirmation, and the user-/aggressive distinction.
- [ ] Registered in site/examples.html with blurb and tags in the established shape; the snippet matches the live demo markup up to the id prefix and passes the parity check added by site-grammar-refresh if it has landed.
- [ ] Keyboard-accessible: no disabled step is reachable by keyboard; the stepper is a real radio group.
- [ ] The handoff records the findings above and any new one.

## Verification

On the committed tree: pnpm run build then pnpm test and pnpm run check all pass, including the site-smoke example-listing test. Under the demo.js build: step two's radio is disabled with a visible explanation until step one is valid; completing step one enables it and the explanation goes; going back and clearing a required field on step one re-disables steps two and three and returns to step one; a field's message appears when it is broken and disappears when it is fixed; the final submit shows the confirmation; the page produces no console.warn or error. The handoff lists the findings.

## Prohibited Patterns

- No new grammar, verbs, events or config; a gap is a finding.
- No changes to validatable — if the events are the wrong shape, that is the most valuable finding this page can produce, and it goes in the handoff, not the code.
- No backend, request mock, or simulated failure; no requestable on this page.
- No hiding steps as the gating mechanism; the gate is the disabled radio, with revealable only showing the selected step's body.
- No CSS-only gating (:invalid, :user-invalid, :has()); the accessibility state must be set in markup.
- No phrase-level key prefix (on-keydown="enter: …").
- No JavaScript in the page beyond the existing demo.js build.
- No duplicating age-gate.html's prose; link to it where the shape is shared.
- No /tmp scratch work; any scratch lives in <repo>/scratch/ and is deleted before finishing.
- No code comments unless requested.
