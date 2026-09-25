# interactably-language-server

A Language Server Protocol server for Interactably `on-*` phrases, shipped in this
repository as the `interactably-language-server` workspace package. Its bin,
`interactably-lsp`, speaks LSP over stdio — no socket, no HTTP, no config file.

```sh
pnpm --filter interactably-language-server exec interactably-lsp --stdio
```

The package imports the parser (`parseWithErrors`) and the built-in implementations
from `interactably`; it copies neither. Adding an implementation to `src/index.ts`
makes it known to the server with no other change.

## What it checks

Diagnostics (push on open/change, pull via `textDocument/diagnostic`):

- `parse-error` — every `ParseError` from `parseWithErrors`, at the parser's range.
- `unknown-verb` — a `.verb(...)` whose receiver's implementations expose no such verb.
- `unknown-receiver` — a `#id` with no element carrying that id (inside a `<template>`
  counts, so a receiver rendered later is not a false positive).
- `unknown-event` — an `on-<event>` that is neither a native DOM event nor declared by
  an implementation on the page.
- `undeclared-implementation` — an element's `implements` name the bootstrap tag does
  not declare. An `implements` on a `<script>` is a declaration; on anything else it is
  a usage.
- `unknown-implementation` — a name in the bootstrap tag's `implements` that is not a
  built-in.
- `missing-bootstrap` — the page has `on-*` or a usage `implements` but no bootstrap tag.
  One informational diagnostic on the first such attribute.

Completion positions:

- after `#` — ids in the document;
- after `#id.` or `this.` — the verbs of the receiver's implementations, each with its
  argument signature as detail;
- inside an element's `implements="…"` — built-in names, with names the bootstrap tag
  does not declare ranked lower and labelled;
- inside the bootstrap tag's `implements="…"` — built-ins not yet listed;
- at an attribute-name position — `on-<event>` for every native event and every event
  the page's implementations declare.

## Attach it in an editor

Neovim (built-in LSP client):

```lua
vim.api.nvim_create_autocmd("FileType", {
  pattern = "html",
  callback = function()
    vim.lsp.start({ name = "interactably", cmd = { "interactably-lsp" }, root_dir = vim.fn.getcwd() })
  end,
})
```

Helix (`~/.config/helix/languages.toml`):

```toml
[[language]]
name = "html"
language-servers = ["interactably-lsp"]

[language-server.interactably-lsp]
command = "interactably-lsp"
```

VS Code (a generic LSP client, such as `vscode-languageclient` or an "LSP client"
extension): register the server with command `interactably-lsp`, transport `stdio`, and
document selector `{ language: "html" }`. No workspace setting is read.

Point it at the built binary if you have not installed the package:

```sh
node packages/language-server/dist/bin.js
```

## What this version does not do

User-authored implementations are not discovered. Reading them from the page's module
script has no general answer from a lone HTML file, and an emitted manifest needs a
build step this server exists to avoid. This is TypeScript without a tsconfig: correct
on built-in defaults, upgradable later with project settings that name where user
implementations live — deliberately not built now. Since there is nothing to detect, the
server is useful the moment an HTML file opens.

Hover is not in scope. It would need the parser to resolve a `#id` or `this` to its
element, find the implementation that owns the verb, and render that verb's signature
(and the implementation's config/state) as Markdown — all data the vocabulary already
holds; the missing piece is the range-to-symbol mapping the completions use, lifted to a
hover provider.

## Implementation notes

- **Package location:** `packages/language-server/`, a pnpm workspace package.
- **HTML parsing:** `vscode-html-languageservice` — its scanner locates start tags and
  attribute/value offsets; no HTML parser is written here. Named and numeric HTML
  entities are decoded with the entity table the same library ships, so parser offsets
  (which are into the decoded attribute value) map back to document offsets.
- **Vocabulary:** derived at startup by importing `interactably` (the built-in
  implementation definitions, including their declared names such as `no-propagate` and
  `prevent-default`) and reading each `defineImplementation` result's verbs, events and
  tags. No table is hand-maintained.
- **One DOM stand-in:** the implementations are evaluated outside a browser, and
  `renderable`'s signature names `HTMLTemplateElement` at module scope. The server
  defines an inert stand-in for it; nothing validates against it.
- **Predicted gaps, reported:** entity offset arithmetic is mapped, not left as a gap.
  Unknown-receiver false positives for later-rendered receivers are suppressed by
  counting ids anywhere in the document. `this` on an element with no `implements` has
  no host verbs, so a verb there is reported unknown. Incremental parsing is not done in
  v1: each change re-analyses the whole document, which is fast for the example pages.
