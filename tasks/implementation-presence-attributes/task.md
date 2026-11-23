---
wait_human_start: false
wait_human_merge: false
dependencies: []
---

# Task: Implementations are presence attributes

## Metadata

- **Complexity:** High
- **Priority:** High
- **Status:** Ready for Handoff

## Context

Receivers are currently identified by `implements="a b"`. Replace that with one boolean attribute per implementation: `<form storable requestable>`. Presence of the attribute is the gate: it unlocks that implementation's config/state attributes and its `on-*` events. Several implementation attributes coexist on one element. This is the first half of the new-forms migration; it must land alone and leave the repository green, so it also migrates every existing `implements="..."` use in tests, site, README and docs.

Settled decisions from the design discussion:
- Implementation names are attribute names: lowercase `[a-z][a-z0-9-]*`.
- Event names are unique across all implementations, not only across implementations whose `tags` overlap.
- Native-name sharing for events (validatable's `invalid`) keeps today's shadowing behaviour.
- The old `implements` attribute is a hard error, not a deprecated alias. There is no production install to protect.

## Requirements

- [ ] `registry/behaviors/_implementation-definition.ts`: reject an implementation name that is not `[a-z][a-z0-9-]*`, starts with `on-`, `aria-` or `data-`, is `implements`, `implementations` or `intersect`, or appears in a new curated `NATIVE_HTML_ATTRIBUTES` list (global HTML attributes plus the common element-specific ones such as `value`, `name`, `type`, `href`, `checked`, `selected`, `disabled`, `multiple`, `required`, `readonly`, `min`, `max`, `step`, `pattern`, `for`, `form`, `action`, `method`, `src`, `alt`, `placeholder`). Throw an error that names the collision.
- [ ] `defineImplementation` throws when two implementations declare the same event name, even when their `tags` do not overlap. Keep the existing 'already registered' name check.
- [ ] `registry/interactable/attachment.ts`: an element is a receiver for each attribute whose name resolves to a registered implementation. Several coexist; `tags` filtering is unchanged; removing an attribute tears that implementation down; adding one attaches it. Config/state attributes are read only while the implementation is present.
- [ ] `registry/interactable/start.ts`: an element participates when it has a registered implementation attribute, any `on-*` attribute, or both. Unknown bare attributes are ignored and are not participation.
- [ ] `registry/interactable/events.ts`: an implementation event is legal as `on-<event>` only when the element carries the owning implementation's presence attribute. `on-response` without `requestable` is a wire-time `console.error`. Events whose names are also native DOM events keep the current native/implementation shadowing rule.
- [ ] Late registration: `registerImplementation` also finds elements already carrying the new attribute in the document and attaches them, preserving the current 'element exists before its implementation loads' behaviour. Remove `pendingMissing`/`reportedMissing` and the `NotReadyError` dispatch branch if they became unreachable; keep the exported `NotReadyError` only if it still has a caller.
- [ ] `registry/interactable/describe-element.ts` reports presence attributes instead of `implements="..."`.
- [ ] An `implements="..."` attribute logs one error per element naming the replacement form and grants no implementations.
- [ ] Migrate every `implements="..."` occurrence in `registry/`, `tests/`, `site/` and `README.md` to bare attributes, including `tests/site-smoke.test.ts` selectors (`[implements~=validatable]` becomes `[validatable]`), site docs/reference prose and every example/fragment. The bootstrap script's `implementations="..."` attribute is unchanged. Leave `packages/language-server` fixtures for the language-server task.
- [ ] No compatibility or deprecation path, and no non-error mention of `implements=` in migrated source or docs.

## Verification

On the committed tree: `pnpm build && pnpm check && pnpm test` pass. `rg -n 'implements="' registry tests site README.md` matches only migration-error tests. `rg -n 'implements' registry tests site README.md` matches only the bootstrap `implementations` attribute, migration-error text, and prose that describes the removed form as an error. `node scripts/build-site.mjs` succeeds and the example pages load with no console errors.

## Prohibited Patterns

- Do not keep `implements` as a working alias or deprecation path.
- Do not infer implementation presence from arbitrary unknown bare attributes.
- Do not gate event uniqueness on `tags` overlap.
- Do not change the bootstrap script's `implementations="..."` attribute.
- Do not leave `pendingMissing`/`reportedMissing` dead code if they are unreachable.
- No `/tmp` scratch work; scratch lives in `<repo>/scratch/` and is deleted before finishing.
- No code comments unless requested.
