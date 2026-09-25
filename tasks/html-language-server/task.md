---
wait_human_start: false
wait_human_merge: false
dependencies: [declarative-bootstrap]
---

# Task: HTML language server — diagnostics and completion for on-* phrases

## Metadata

- **Complexity:** High
- **Priority:** High
- **Status:** Ready for Handoff

## Context

Interactably's phrases live in HTML attributes, and nothing in an editor today knows they are a language: a typo in a verb, a receiver that does not exist, or an unbalanced chain surfaces only when the page runs. This task gives the phrases an editor: a Language Server Protocol server shipped as a binary inside the interactably package the way tsserver ships inside typescript.

Two prerequisites have landed or are landing:
- Parser offsets (d29c91a). Every parsed node carries flat start/end offsets into the attribute value, plus keyStart/keyEnd; ParseError carries a range; parseWithErrors returns both tree and errors. Offsets are non-enumerable. The server converts attribute-relative offsets to document positions by adding the attribute value's own offset in the HTML; it never re-parses phrases itself.
- Declarative bootstrap (dependency). The page declares which implementations it uses in an implements attribute on the script tag that loads interactably. That attribute is the server's sole source of the page's vocabulary.

implements is deliberately overloaded: on the bootstrap script it is a declaration of what the page loads, and on any other element it is a usage. The server depends on this, but every query must be scoped by tag. A declaration is script[implements]; a usage is implements on anything that is not a script. Conflating them would make every element that uses an implementation appear to declare it, and the not-declared diagnostic would never fire.

Scope: built-ins only. The server knows exactly what the interactably package exports, each with verbs, events, config, state and tags from defineImplementation, plus the phrase grammar (implementation-independent and always correct). It does not discover user-authored implementations, because: reading them from the page's module script has no general answer from a lone HTML file; an emitted manifest needs a build step this server exists to avoid; the correct model is TypeScript without a tsconfig, an inferred mode that is fully functional on defaults and upgradable later; Tailwind's IntelliSense is the failure mode to avoid (it goes silent when project detection misses). The server says something useful the instant an HTML file opens, because there is nothing to detect. The upgrade path (project settings naming where user implementations live) is recorded as future work and must not be built now.

Recognising the tag: the server treats a script type=module as the bootstrap when its src matches one of these shapes, where pkg is interactably, @version is optional and may be a semver, range or dist-tag, and trailing paths/query strings are permitted: cdn.jsdelivr.net/npm/pkg[@version][/...] including /+esm; esm.run/pkg[@version][/...]; unpkg.com/pkg[@version][/...]; esm.unpkg.com/pkg[@version][/...]; esm.sh/pkg[@version][/...]; a relative or absolute path whose final segments are node_modules/pkg/... or dist/cdn/.... Skypack is deliberately excluded (frozen build service). An implements attribute on a module script whose src matches none of these still counts: the attribute is the declaration, the URL match is a confidence signal, not a gate. Duplicate tags union their lists, mirroring the runtime.

What it reports. Diagnostics (the floor, derived from data already in hand): every ParseError from parseWithErrors at its range with its message verbatim (the parser's messages are the diagnostics, the server adds nothing); unknown verb, a .verb(...) whose receiver's declared implementations expose no such verb, range keyStart/keyEnd; unknown receiver, #id with no element carrying that id in the document, range the ref; unknown event, an on-<event> attribute where event is neither a native DOM event nor declared by any implementation on the page, range the attribute name; an implementation named in an element's implements that the bootstrap tag does not declare, range the offending name within the value; an implementation named in the bootstrap tag's implements that is not a built-in; and missing-bootstrap when the page contains on-* or implements but no bootstrap tag, one informational diagnostic on the first such attribute saying the page will not attach.

Completion: after # lists ids present in the document; after #id. or this. lists verbs of the implementations that element declares, each with its argument signature as detail; inside an element's implements=" lists built-in implementation names, ranking those the bootstrap tag does not declare lower with a note saying so; inside the bootstrap tag's implements=" lists built-in names not yet listed; attribute name position on an element lists on-<event> for every native event and every event declared by the page's implementations. Hover is not in scope; the handoff should note what it would need.

Packaging: lives as its own workspace package in the interactably repository (recommend packages/language-server/ or lsp/; the implementer decides and reports), importing the parser and implementation registry from the main package rather than copying anything. Ships a bin named interactably-lsp speaking LSP over stdio (no socket, no HTTP). Uses vscode-languageserver and vscode-languageserver-textdocument, or a comparably standard protocol implementation. HTML is parsed with vscode-html-languageservice or equivalent to get attribute positions; the server does not write an HTML parser. The registry the server validates against is derived once from the built-in implementations at startup (verbs, events, tags per implementation), the same data describe-element.ts already reads; do not hand-maintain a second table. An editor client is not in scope: the binary plus a README section showing how to point Neovim (lspconfig), Helix and VS Code's generic LSP client at it is sufficient for v1.

Expected gaps (predictions, not requirements; the handoff reports which materialised): offset arithmetic when an attribute value contains HTML entities (the parser saw decoded text, the document has &amp;, positions off by the entity width unless mapped); receivers that exist only after a renderable insertion or inside <template> (unknown-receiver false positive; recommend suppressing it when the id appears anywhere in the document, including inside <template>, and reporting the shortfall); this on an element with no implements but with on-* (its verbs are the host's per implementation-utils.ts; check what describe-element.ts does); incremental parsing (v1 may re-run on the whole document per change; measure before optimising).

## Requirements

- [ ] A workspace package inside the repo builds to a bin named interactably-lsp that speaks LSP over stdio and is published with the main package.
- [ ] Opening an HTML document yields diagnostics for every ParseError in every on-* attribute, positioned at the parser's ranges translated to document positions.
- [ ] Unknown verb, unknown receiver, unknown event, an element's implements not declared by the bootstrap tag, a non-built-in on the bootstrap tag, and missing-bootstrap are each reported as described, at the specified range.
- [ ] Declaration and usage are distinguished by tag everywhere: a declaration is implements on a <script>, a usage is implements on anything else. A page whose only implements is on elements reports missing-bootstrap rather than treating those as declarations.
- [ ] Completion works in the five positions listed, with verb completions carrying argument signatures.
- [ ] The bootstrap tag is recognised by any of the URL shapes listed, with and without a version segment; an implements attribute on a module script with an unrecognised src is still honoured.
- [ ] The vocabulary table is derived from the built-in implementations at startup, not written by hand. Adding an implementation to src/index.ts makes it known to the server with no other change.
- [ ] No configuration file is read and none is required. Nothing outside the package is resolved, fetched or analysed.
- [ ] Tests: a fixture HTML per diagnostic kind with an assertion on kind and range; a fixture per completion position; a fixture per URL shape; a fixture with an HTML entity inside a phrase confirming the position is correct or the gap is reported.
- [ ] README section: what the server checks, how to run it, how to attach it in three editors, and an explicit note that user implementations are not discovered in this version and why.

## Verification

pnpm run build then pnpm test pass, including the new package's tests. Running interactably-lsp and sending an initialize request over stdio returns capabilities including textDocumentSync, diagnostics (pull or push), and completionProvider. Opening site/examples/todo-list.html (post-bootstrap migration) yields zero diagnostics, and the bootstrap <script implements="..."> itself produces none; introducing a typo in a verb yields exactly one, at the verb. Removing an implementation from that page's bootstrap tag yields a diagnostic on each element implements that used it, and none on the script tag. Completion after # in that page lists its ids; after #<id>. lists that element's verbs. Handoff reports the package location chosen, the HTML parsing library used, which predicted gaps materialised, and what hover would need.

## Prohibited Patterns

- Do NOT re-implement or fork the phrase parser. Import parseWithErrors and use its offsets.
- Do NOT read, resolve, fetch or statically analyse a module script's contents. The script tag's implements attribute is the only source of the page's vocabulary.
- Do NOT treat an element's implements as a declaration, and do NOT treat the bootstrap tag's implements as a usage. Scope every query by tag.
- Do NOT read a config file, project file or editor setting for implementation discovery. Record the extension path in the README; do not build it.
- Do NOT hand-write a table of verbs or events. Derive it from the implementations.
- Do NOT include Skypack in the recognised CDN shapes.
- Do NOT write an editor extension or client. Binary plus attach instructions.
- Do NOT go silent. If the server cannot determine something, it says so in a diagnostic or a completion detail rather than offering nothing.
- Do NOT touch the parser, the runtime, the bootstrap or any implementation. This task only consumes them.
