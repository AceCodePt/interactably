# interactably-language-server

A Language Server Protocol server for Interactably `on-*` handlers, shipped in this
repository as the `interactably-language-server` workspace package. Its bin,
`interactably-lsp`, speaks LSP over stdio: no socket, no HTTP, no config file.

```sh
pnpm --filter interactably-language-server exec interactably-lsp --stdio
```

The package imports the parser (`parseEventValueWithErrors`) and the built-in implementations
from `interactably`; it copies neither. Adding an implementation to `src/index.ts`
makes it known to the server with no other change.

## What it checks

Diagnostics (push on open/change, pull via `textDocument/diagnostic`):

- `parse-error`: every `ParseError` from `parseEventValueWithErrors`, at the parser's
  range: malformed handlers, an unbracketed list of two or more handlers, a body that is
  not braced, and an attribute name that still carries an old value declaration (reported
  with the handler-parameter form as the fix).
- `unknown-verb`: a `.verb(...)` whose receiver's implementations expose no such verb.
- `unknown-receiver`: a `#id` with no element carrying that id (inside a `<template>`
  counts, so a receiver rendered later is not a false positive).
- `unknown-event`: an `on-<event>` that is neither a native DOM event nor declared by
  any implementation.
- `undeclared-implementation`: a presence attribute such as `revealable` that the
  bootstrap script's `implementations` does not list.
- `unknown-implementation`: a name in a `script[implementations]` that is not a
  built-in.
- `missing-bootstrap`: the page has a presence attribute or `on-*` but no
  `script[implementations]`. One informational diagnostic on the first such attribute.
- `legacy-implementation-list`: the removed implementation-list attribute, reported at
  its name with the presence-attribute form as the fix.
- `missing-event-owner`: an implementation event such as `on-rendered` on an element
  that does not carry the owning implementation's presence attribute.
- `unknown-event-field`: a parameter field that a closed event does not expose.
- `event-field-mismatch`: a literal that cannot read as the field's declared type, a
  type that is not valid tsyntax, or a declared type with no overlap with the field.
- `unbound-name`: a body name not bound by its own handler's parameter.
- `duplicate-id`, `duplicate-named-id`: native ids and `-id` config values that repeat
  in one document.

Completion positions:

- after `#`: ids in the document;
- after `#id.` or `this.`: the verbs of the receiver's implementations, each with its
  argument signature as detail;
- at an attribute-name position: built-in implementation names, then, once one is
  present, its config and state attribute names and the `on-*` events it declares;
- inside a script's `implementations="…"`: built-ins not yet listed;
- inside an `on-*` parameter list `( … )`: the event's field names not yet used;
- inside a handler body: the names bound by that handler's parameter.

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
implementations live: deliberately not built now. Since there is nothing to detect, the
server is useful the moment an HTML file opens.

Hover is not in scope. It would need the parser to resolve a `#id` or `this` to its
element, find the implementation that owns the verb, and render that verb's signature
(and the implementation's config/state) as Markdown: all data the vocabulary already
holds; the missing piece is the range-to-symbol mapping the completions use, lifted to a
hover provider.

## Implementation notes

- **Package location:** `packages/language-server/`, a pnpm workspace package.
- **HTML parsing:** `vscode-html-languageservice`: its scanner locates start tags and
  attribute/value offsets; no HTML parser is written here. Named and numeric HTML
  entities are decoded with the entity table the same library ships, so parser offsets
  (which are into the decoded attribute value) map back to document offsets.
- **Vocabulary:** derived at startup by importing `interactably` (the built-in
  implementation definitions, including their declared names such as `no-propagate` and
  `prevent-default`) and reading each `defineImplementation` result's verbs, config and
  state attribute keys, events with their fields and open flag, and tags. The server also
  builds an event-to-owner map from those definitions. No table is hand-maintained.
- **One DOM stand-in:** the implementations are evaluated outside a browser, and
  `renderable`'s signature names `HTMLTemplateElement` at module scope. The server
  defines an inert stand-in for it; nothing validates against it.
- **Predicted gaps, reported:** entity offset arithmetic is mapped, not left as a gap.
  Unknown-receiver false positives for later-rendered receivers are suppressed by
  counting ids anywhere in the document. `this` on an element with no presence attribute
  has no host verbs, so a verb there is reported unknown. Incremental parsing is not done in
  v1: each change re-analyses the whole document, which is fast for the example pages.
