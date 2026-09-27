---
wait_human_start: false
wait_human_merge: false
dependencies: []
---

# Task: page-unique names end in -id

## Metadata

- **Complexity:** Medium
- **Priority:** Medium
- **Status:** Ready for Handoff

## Context

The language resolves every receiver by `id`, so a duplicated `id` is already a real bug: `document.getElementById` returns the first match and the second element is silently never addressed. The language server does not currently detect this. `packages/language-server/src/html.ts` builds `byId` as a `Map`, so a duplicate simply overwrites and disappears.

Implementations are also starting to need document-unique names of their own, addressed by a config attribute rather than by the native `id`. Rather than inventing a type-level marker for this, the project adopts a naming convention: a config attribute whose name ends in `-id` holds a page-unique name. The constraint is carried by the attribute's name, where an author reading the markup will see it, and `id` already means unique to anyone who knows HTML.

The convention is deliberately shallow. It is not a new type, not a tsyntax keyword and not a runtime check. tsyntax stays a TypeScript-shaped type language whose keywords mean what they mean in TypeScript; a document-scoped constraint is not a type and would be meaningless as a verb argument or an event field. Enforcement is a language-server diagnostic and nothing else.

Uniqueness is a contract with the author, not a guarantee. Duplicate `id`s are invalid HTML that renders happily, and the same is true of any `-id` attribute. The diagnostic catches violations; it does not prevent them.

Each `-id` namespace is separate. A value in `storable-id` and an element `id` with the same text do not collide, because they are checked as two independent sets and addressed through different mechanisms.

Decisions agreed before handoff:
- The `-id` suffix is matched as a whole `-id` boundary, i.e. `attribute.name.endsWith("-id")`, not a bare `endsWith("id")`. This matches the `<name>-id` config form and avoids false positives such as `...-grid` / `...-valid`. Native `id` is handled separately and is not part of the `-id` pass.
- Two diagnostic codes: `duplicate-id` for the native `id` namespace and `duplicate-named-id` for the `-id` config attribute namespaces, both at `DiagnosticSeverity.Error`.

Note for the implementer: the language-server package's dependencies (`vscode-html-languageservice`, etc.) may need `pnpm install` in a fresh checkout before `pnpm run build` / `pnpm test` can run.

## Requirements

- [ ] `packages/language-server/src/html.ts` retains duplicate `id` occurrences rather than collapsing them into `byId`, so duplicates are detectable downstream. Add an explicit occurrence list to `HtmlDocumentModel` (e.g. `idOccurrences: readonly { value: string; valueStart: number; valueEnd: number }[]`) populated during element close. `byId` keeps its current first-wins resolution behaviour for receiver lookup, and `ids` keeps its current meaning.
- [ ] A new diagnostic code `duplicate-id` reports every element carrying an `id` that another element in the same document also carries. Each duplicate occurrence is reported at its own attribute value range (`valueStart`..`valueEnd`), including the first. Severity `Error`.
- [ ] A new diagnostic code `duplicate-named-id` reports duplicate values within each config attribute whose name ends in `-id`, scoped per attribute name: two elements with the same `storable-id` are reported, and a `storable-id` matching an element `id` is not. Match attribute names with `name.endsWith("-id")` and exclude the native `id`. Each occurrence is reported at its own attribute value range. Severity `Error`.
- [ ] The `-id` namespaces and the native `id` namespace are checked independently of one another (grouping is per attribute name; native `id` goes through `duplicate-id`, `-id` names through `duplicate-named-id`).
- [ ] The convention is documented in `site/docs.html` where config attributes are explained (the `config` bullet around line 842 / the conventions section): a config attribute whose name ends in `-id` holds a name that must be unique within the page, and the language server checks it.
- [ ] `site/reference.html` states the same rule wherever config attribute naming is described (add a sentence at the `Shipped implementations` heading, where the `<impl>-<key>` config names live).
- [ ] `packages/language-server/tests/diagnostics.test.ts` covers: duplicate native `id`, three-way duplicate (three diagnostics, each covering its own value), a `-id` config attribute duplicated across two elements, a `-id` value equal to some element's native `id` reported as clean, and a document with no duplicates reported as clean.
- [ ] A test iterates all 35 pages in `site/examples/` and asserts zero diagnostics after the change. Add a helper to `packages/language-server/tests/support.ts` (e.g. `siteExampleNames()` via `readdirSync`) to enumerate them.

## Verification

`pnpm run build` then `pnpm test` passes (run `pnpm install` first on a fresh checkout so the language-server package deps resolve).
`pnpm run check` passes.
The language server reports zero diagnostics across `site/examples/` (enforced by the new all-examples test).

## Prohibited Patterns

- Do not add a tsyntax keyword, reserved word or type for uniqueness. tsyntax is not modified by this task.
- Do not add a runtime uniqueness check in `registry/`. This is a tooling diagnostic only.
- Do not check uniqueness across documents. The scope is one page.
- Do not merge the `-id` namespaces with the native `id` namespace.
- Do not change how receivers resolve at runtime or in the language server; first-wins stays.
- Do not use a bare `endsWith("id")`; use the `-id` boundary so unrelated keys such as `...-grid` are not treated as page-unique names.
