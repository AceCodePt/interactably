# Handoff: A shop with an anonymous cart

## Findings

- **Quantity and line price:** Quantity is intentionally omitted. Each click is one unit and the formula language has no per-row multiplication or a stamped-row self-calculation. The lede states this rather than implying a conventional quantity cart.
- **Total after restore:** `sum()` uses the library's typed value reader. A plain display span with numeric text is a string, so the line template gives each `.cart-price` a numeric `formattable-value` and format metadata. The cart's single `on-rendered` phrase then saves the DOM and recomputes the total for every render, including the restore render; no page-load total phrase is needed.
- **Empty state:** `render({payload: ''})` is accepted and produces an empty `DocumentFragment`. The rendered event saves the empty `innerHTML` and sets the total to zero; the CSS `:empty` rule supplies the visible empty message because the DSL has no conditional empty-state rendering.
- **Duplicate lines:** There is deliberately no lookup, merge, or dedupe. Clicking the same product twice stamps two lines. `now()` supplies the required row id; it remains a millisecond-based id, so a same-tick collision is a renderable duplicate-id failure rather than an invented merge rule.
- **Restored controls:** The document-level `MutationObserver` attaches the restore markup, so every restored remove button is live.

## Verification

- `pnpm build` passes.
- `pnpm test` passes, including the site listing, snippet drift, cart add/remove/restore/empty behavior, and total checks.
- `pnpm check` passes.
