---
wait_human_start: false
wait_human_merge: false
dependencies: [example-todo-list]
---

# Task: Site example: a shop with an anonymous cart

## Metadata

- **Complexity:** Medium
- **Priority:** High
- **Status:** Ready for Handoff

## Context

The second application-shaped example, and the one the recent storable and renderable work was done for. It reuses the findings of tasks/example-todo-list (read its handoff first) and adds the things a cart has that a to-do list does not: line items stamped from a product's own literals, a running total, and persistence across reloads with no account.

Why anonymous, and why markup. Once a user is logged in the cart belongs to the server — the server owns stock and pricing anyway, and requestable swaps rendered cart markup in with no local state. Client-side persistence is only for the anonymous case, which is the majority case: every shop allows anonymous add-to-cart. For that case the cart is stored as markup, not data. The XSS objection does not apply — localStorage is same-origin and only the page itself can write it, so an attacker who can write there already runs script on the origin. The real cost is staleness: a stored fragment from an older template renders wrong after a deploy, undetectably, where data would degrade gracefully with fallbacks. That cost is affordable for something short-lived and low-stakes like a cart; anything longer-lived (drafts, form progress, saved filters) wants data, not markup. This reasoning is design context for the implementer, not page prose — the page should not lecture about XSS.

The DOM is the source of truth; storage mirrors it. renderable stamps a line into the cart, and on-rendered on the cart snapshots the cart's innerHTML through a storable whose storable-value is a ref to the cart. Removal is a delete swap followed by the same snapshot. Nothing is concatenated, nothing is removed from a string, and no array exists.

Static site, honest seam, as the to-do brief says: no backend, no mock, no fake failure. There is no checkout — a checkout is the moment the cart becomes the server's, and this site has no server. The page ends where the anonymous cart ends, and the lede says so.

Shape:
- Products are static markup on the page — three or four cards, each with a name, a price and an "Add to cart" button. Each button carries its product's literals: on-click="#cart.render({template: #cart-line-tpl, swap: 'beforeend', id: now(), name: 'Enamel mug', price: 12})". The product knows its own name and price; the cart template only has slots.
- Cart line template: <li id="cart-line-{id}"> showing {name}, the price as <span class="cart-price">{price}</span>, and a remove button on-click="#cart.render({swap: 'delete', target: '#cart-line-{id}'})". Same per-row delete shape as dynamic-list and todo-list.
- The cart element implements renderable and carries on-rendered="#cart-store.save(); #cart-total.set(sum('#cart .cart-price'))" — one save site, one total recompute, both driven by the render event. Confirm sum() reads what you need from the elements the selector matches before relying on it; if it reads only form-control values, the price must live in a form control or the gap is a finding.
- Persistence: #cart-store implements storable with storable-key="cart" storable-value="#cart", on-load="this.restore()" and on-restore(value:string)="#cart.render({payload: value})". The total is recomputed by the rendered event that render fires, so restore needs no extra phrase for it.
- Empty cart button: on-click="#cart.render({payload: ''})" — an empty payload replaces the children with nothing and fires rendered, which saves the empty snapshot and zeroes the total. Verify render accepts an empty string payload (fragmentFromMarkup('')); if it throws or is rejected by the signature, that is a finding and #cart-store.clear() plus a visible reset is the fallback.
- Same product twice: there is no lookup or merge in the grammar, so adding the same product twice produces two lines. Do not invent one. Record it; the honest page prose can say each click adds a line.

Findings this page is expected to surface (record each in the handoff, with how it was handled or why it could not be):
- Quantity per line. A real cart has a quantity control and a line price that is price × quantity. The formula language has sum/count but no per-row multiplication, and a stamped row has no way to recompute its own line price from a quantity input. Either the page omits quantity (each click is one unit, stated plainly) or it finds a clean expression; do not force one.
- The total after restore: it must come out right from the rendered event alone, with no page-load phrase that reads storage.
- Empty state, as in the to-do list.
- Anything the to-do handoff listed that recurs here.

## Requirements

- [ ] site/examples/shop-cart.html following the established page furniture; page ids prefixed (cart-, shop-) with the snippet free to use short ids.
- [ ] Three or four static product cards, each add button carrying that product's name and price literals into the cart template's slots.
- [ ] A cart line template with a per-line remove button using the delete swap by id.
- [ ] One save site and one total recompute, both on the cart's on-rendered.
- [ ] Persistence through a storable with a ref storable-value; restore through on-restore(value:string) into render({payload: value}); the total correct after reload with no extra phrase.
- [ ] An empty-cart action that leaves storage and the total consistent with the DOM.
- [ ] The lede states the constraints honestly: static site, no checkout, cart kept in local storage for an anonymous visitor, each click adds a line.
- [ ] Registered in site/examples.html; the shown snippet matches the live demo markup up to the id prefix.
- [ ] Restored lines are live: after reload, every restored remove button works.
- [ ] The handoff records the findings above — quantity/line price, total-after-restore, empty state, duplicate lines — and any new one.

## Verification

On the committed tree: pnpm run build then pnpm test and pnpm run check all pass, including the site-smoke example-listing test. Under the demo.js build: adding products appends lines and the total updates; removing a line updates the total; reload restores the lines and the total; emptying the cart zeroes both and survives reload as empty; every restored remove button fires. The snippet matches the demo markup. The handoff lists the findings.

## Prohibited Patterns

- No backend, request mock, or simulated failure; no checkout of any kind.
- No storing the cart as data (JSON, arrays, delimited strings); the cart is the DOM and storage mirrors it as markup.
- No lookup, merge or dedupe of lines; no invented grammar for quantity or per-row arithmetic — a gap is a finding.
- No changes to renderable, storable, requestable or the formula language; if one seems needed, that is a finding.
- No phrase-level key prefix (on-keydown="enter: …") on this page.
- No duplicating the to-do page's prose; link to it where the shape is shared.
- No /tmp scratch work; any scratch lives in <repo>/scratch/ and is deleted before finishing.
- No code comments unless requested.
