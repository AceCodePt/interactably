---
wait_human_start: false
wait_human_merge: false
dependencies: [implementation-presence-attributes, arrow-function-values, remove-legacy-phrase-keys]
---

# Task: Tests use only the new forms

## Metadata

- **Complexity:** Low
- **Priority:** Low
- **Status:** Ready for Handoff

## Context

The runtime tasks migrate the fixtures they touch so each checkpoint stays green. This task is the sweep: find and fix every remaining fixture that still relies on `implements=`, declaration data in an attribute name, concise bodies or phrase keys, then enforce the grep gates. Migration-error tests are the only allowed carriers of the old forms.

## Requirements

- [ ] Audit `tests/`, `registry/**/*.test.ts` and `registry/behaviors/test-harness.ts` for the old forms: `implements="`, declaration names such as `on-response(html:string)`, `on-intersect(state:`enter`)`, backticked declaration literals, concise bodies and `key:` phrase prefixes.
- [ ] Keep or add migration-error tests that assert each removed form is rejected with a message naming its replacement.
- [ ] Update the harness and helpers so new tests author presence attributes and braced handlers directly.
- [ ] Enforce the grep gates: `rg -n 'implements="' tests registry` matches only migration-error tests; `rg -nE 'on-[a-z-]+\(' tests registry` matches only migration-error tests.
- [ ] `pnpm build && pnpm check && pnpm test` pass on the committed tree.

## Verification

On the committed tree: `pnpm build && pnpm check && pnpm test` pass. `rg -n 'implements="' tests registry` and `rg -nE 'on-[a-z-]+\(' tests registry` match only migration-error tests. `rg -n 'keyStart|keyEnd|\.key\b' tests registry` finds no phrase-key code.

## Prohibited Patterns

- Do not weaken a test to pass; migrate it to the new form.
- Do not leave a fixture on an old form outside a migration-error test.
- No `/tmp` scratch work; scratch lives in `<repo>/scratch/` and is deleted before finishing.
- No code comments unless requested.
