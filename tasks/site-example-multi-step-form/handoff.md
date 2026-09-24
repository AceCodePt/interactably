# Handoff: A multi-step form, gated on validity

## Findings

- **User validity semantics:** The required fields stay quiet on initial load. After a field has been filled, clearing it fires `user-invalid` and reveals its message; filling it again fires `user-valid` and hides the message. The page deliberately has no `storable` restore, so the restore-installed-value case is not exercised here; the validatable brief and its behavior tests remain the source for that promise.
- **Form shape:** Each step is a sibling `<form>` because a `fieldset` is barred from constraint validation and does not aggregate its children. The stepper's own fieldset is only semantic radio-group furniture.
- **Accessibility gate:** `aria-disabled` alone would leave a control keyboard reachable, so each later radio also gets the native `disabled` attribute. `aria-disabled` and `aria-describedby` explain the state; the native attribute removes the radio from sequential keyboard navigation. The explanation reference is removed with the lock and restored with it.
- **Transitive closing:** The DSL has no wildcard or relay for “every later step,” so each form explicitly names the later radios it must close. That makes the invalid phrases repetitive, but it keeps the closure explicit and transitive. A declarative relay would be a new mechanism, so it was left as a finding.
- **Returning to a broken step:** `attributable` writes the native `checked` and `disabled` attributes. Chromium and jsdom both re-select the broken radio after a later radio had been selected, while the selected panel is shown explicitly; no new `check()` verb was added.
- **Aggressive versus quiet:** The only aggressive pair is on the first form and updates the live “Step 1 of 3 complete/incomplete” indicator. Its repeated evaluations are intentional and idempotent; gates and field messages stay on the quiet user pair.
- **`validatable-on`:** Gate forms use `change` because a committed value is the meaningful completion point. Message-bearing fields use `input` so feedback follows typing rather than waiting for blur.
- **Static boundary:** The final form prevents the native request, runs `validate()`, and reveals a local confirmation. There is no backend, request mock, storage, or simulated failure. The to-do and cart persistence/render findings do not recur because this composition intentionally uses none of those implementations; their shared static-site constraint does recur and is stated in the lede.
- **Namespacing:** Every live id is prefixed with `step-` because the site smoke test mounts example bodies together. The copied snippet uses short ids and retains the same interaction shapes.

## Verification

- `pnpm run build` passes.
- `pnpm test` passes, including the multi-step site behavior, site listing, snippet drift, and console checks.
- `pnpm run check` passes.
- `pnpm run build:site` passes.
- The built page was exercised in Chromium: locked radios were skipped by Tab, completing steps opened the next radio, breaking step 1 re-disabled steps 2 and 3 and returned to step 1, field messages appeared and disappeared, the final submit showed confirmation, and no console warnings or errors were produced.
