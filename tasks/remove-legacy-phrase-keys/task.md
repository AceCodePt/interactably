---
wait_human_start: false
wait_human_merge: false
dependencies: [arrow-function-values]
---

# Task: Remove legacy phrase keys

## Metadata

- **Complexity:** Medium
- **Priority:** High
- **Status:** Ready for Handoff

## Context

Phrase keys (`enter: #f.send()`) predate handler parameters. They were the old way to route a firing to a phrase, and handler parameters now do that job. The user asked to remove the legacy phrasing entirely: no `key:` prefix in a phrase, no key in the AST, no routing guard in the executor, and no `ImplementationEvent.key`.

The `event:key` / `event:code:value` entries in `prevent-default-events` and `no-propagate-events` are configuration lists, not phrasing, and stay unchanged.

## Requirements

- [ ] `registry/interactable/parser.ts`: remove `findKeyColon`, the optional key prefix from `phrase`, and `Phrase.key`, `keyStart` and `keyEnd`. A value containing a top-level `key:` prefix is a grammar error naming the parameter form.
- [ ] `registry/interactable/executor.ts`: remove the key guard in `runPhrase` and all references to `phrase.key`/`ev.key`.
- [ ] `registry/interactable/implementation-event.ts`: remove the `key` field and init option. Update every dispatcher, including `intersect.ts`, `requestable.ts` and `storable.ts`.
- [ ] Remove keyed phrases from every test, fixture, example and doc page, replacing them with handler parameters where they filtered and with a plain body where they did not. This includes the executor keyed-phrase tests, `intersect.test.ts`, `attach.test.ts` and the docs grammar/constructs sections.
- [ ] Keep the `event:key` config-list parsing and tests for `prevent-default-events` and `no-propagate-events`.
- [ ] `pnpm build && pnpm check && pnpm test` pass on the committed tree.

## Verification

On the committed tree: `pnpm build && pnpm check && pnpm test` pass. `rg -n 'keyStart|keyEnd|\.key\b|timeout:|offline:|enter:' registry tests site README.md` finds no phrase-key syntax; remaining `key` matches are event field names, config lists, or the keyboard `key` property.

## Prohibited Patterns

- Do not keep phrase keys as aliases or deprecation paths.
- Do not remove the `event:key` / `event:code:value` syntax from `prevent-default-events` or `no-propagate-events`.
- No `/tmp` scratch work; scratch lives in `<repo>/scratch/` and is deleted before finishing.
- No code comments unless requested.
