import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import type { JSDOM } from "jsdom";
import { setupJsdom, teardownJsdom, flush } from "@tests/jsdom.ts";

let dom: JSDOM;
let dispose: () => void;
let dispatchInteraction: typeof import("@behaviors/test-harness.ts").dispatchInteraction;

before(async () => {
  dom = setupJsdom();
  await import("@behaviors/renderable/renderable.ts");
  ({ dispatchInteraction } = await import("@behaviors/test-harness.ts"));
  const { start } = await import("@interactable/start.ts");
  dispose = start();
});

after(() => {
  dispose();
  teardownJsdom(dom);
});

beforeEach(() => {
  document.body.replaceChildren();
});

function mount(): HTMLElement {
  const el = document.createElement("ul");
  el.id = "list";
  el.setAttribute("implements", "renderable");
  document.body.appendChild(el);
  return el;
}

function template(html: string): HTMLTemplateElement {
  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  document.body.appendChild(tpl);
  return tpl;
}

test("render beforeend stamps a clone, filling text and attribute slots", async () => {
  const list = mount();
  await flush();
  const tpl = template('<li id="row-{id}"><span>{title}</span></li>');

  dispatchInteraction(list, "render", { template: tpl, swap: "beforeend", id: 7, title: "hello" });

  assert.equal(list.children.length, 1);
  const row = list.children[0] as HTMLElement;
  assert.equal(row.id, "row-7");
  assert.equal(row.querySelector("span")?.textContent, "hello");
});

test("beforeend preserves the fragment's child order", async () => {
  const list = mount();
  await flush();
  const tpl = template("<li>{a}</li><li>{b}</li>");

  dispatchInteraction(list, "render", { template: tpl, swap: "beforeend", a: "first", b: "second" });

  assert.deepEqual([...list.children].map((row) => row.textContent), ["first", "second"]);
});

test("afterbegin prepends the stamped nodes in order", async () => {
  const list = mount();
  await flush();
  list.innerHTML = "<li>existing</li>";
  const tpl = template("<li>{a}</li><li>{b}</li>");

  dispatchInteraction(list, "render", { template: tpl, swap: "afterbegin", a: "first", b: "second" });

  assert.deepEqual([...list.children].map((row) => row.textContent), ["first", "second", "existing"]);
});

test("beforebegin and afterend place the nodes around a target selector", async () => {
  const list = mount();
  await flush();
  list.innerHTML = '<li id="anchor">anchor</li>';
  const tpl = template("<li>{x}</li>");

  dispatchInteraction(list, "render", { template: tpl, swap: "beforebegin", target: "#anchor", x: "before" });
  dispatchInteraction(list, "render", { template: tpl, swap: "afterend", target: "#anchor", x: "after" });

  assert.deepEqual([...list.children].map((row) => row.textContent), ["before", "anchor", "after"]);
});

test("innerHTML replaces the destination's children", async () => {
  const list = mount();
  await flush();
  list.innerHTML = "<li>old</li>";
  const tpl = template("<li>{x}</li>");

  dispatchInteraction(list, "render", { template: tpl, swap: "innerHTML", x: "new" });

  assert.deepEqual([...list.children].map((row) => row.textContent), ["new"]);
});

test("outerHTML replaces the targeted element", async () => {
  const list = mount();
  await flush();
  list.innerHTML = '<li id="anchor">old</li>';
  const tpl = template("<li>{x}</li>");

  dispatchInteraction(list, "render", { template: tpl, swap: "outerHTML", target: "#anchor", x: "new" });

  assert.equal(document.getElementById("anchor"), null);
  assert.deepEqual([...list.children].map((row) => row.textContent), ["new"]);
});

test("delete removes the targeted element without a template", async () => {
  const list = mount();
  await flush();
  list.innerHTML = '<li id="row-1">one</li><li id="row-2">two</li>';

  dispatchInteraction(list, "render", { swap: "delete", target: "#row-1" });

  assert.equal(document.getElementById("row-1"), null);
  assert.deepEqual([...list.children].map((row) => row.id), ["row-2"]);
});

test("none touches nothing", async () => {
  const list = mount();
  await flush();
  list.innerHTML = "<li>kept</li>";

  dispatchInteraction(list, "render", { swap: "none" });

  assert.equal(list.textContent, "kept");
});

test("undo removes the nodes an adjacency render inserted", async () => {
  for (const swap of ["beforeend", "afterbegin", "beforebegin", "afterend"] as const) {
    document.body.replaceChildren();
    const list = mount();
    await flush();
    const anchor = document.createElement("li");
    anchor.id = "anchor";
    list.appendChild(anchor);
    const tpl = template('<li class="new">{x}</li>');

    dispatchInteraction(list, "render", { template: tpl, swap, target: "#anchor", x: "n" });
    assert.equal(document.querySelectorAll(".new").length, 1, `${swap} inserted one node`);

    dispatchInteraction(list, "undo");
    assert.equal(document.querySelectorAll(".new").length, 0, `${swap} undo removed it`);
  }
});

test("undo after innerHTML restores the displaced children", async () => {
  const list = mount();
  await flush();
  list.innerHTML = "<li>old-a</li><li>old-b</li>";
  const tpl = template("<li>new</li>");

  dispatchInteraction(list, "render", { template: tpl, swap: "innerHTML" });
  assert.deepEqual([...list.children].map((row) => row.textContent), ["new"]);

  dispatchInteraction(list, "undo");
  assert.deepEqual([...list.children].map((row) => row.textContent), ["old-a", "old-b"]);
});

test("undo after outerHTML restores the displaced element", async () => {
  const list = mount();
  await flush();
  list.innerHTML = '<li id="anchor">old</li>';
  const anchor = document.getElementById("anchor")!;
  const tpl = template("<li>new</li>");

  dispatchInteraction(list, "render", { template: tpl, swap: "outerHTML", target: "#anchor" });
  assert.equal(document.getElementById("anchor"), null);

  dispatchInteraction(list, "undo");
  assert.equal(document.getElementById("anchor"), anchor);
  assert.deepEqual([...list.children].map((row) => row.textContent), ["old"]);
});

test("undo after delete restores the removed element in place", async () => {
  const list = mount();
  await flush();
  list.innerHTML = '<li id="row-1">one</li><li id="row-2">two</li>';
  const removed = document.getElementById("row-1")!;

  dispatchInteraction(list, "render", { swap: "delete", target: "#row-1" });
  assert.equal(document.getElementById("row-1"), null);

  dispatchInteraction(list, "undo");
  assert.equal(document.getElementById("row-1"), removed);
  assert.deepEqual([...list.children].map((row) => row.id), ["row-1", "row-2"]);
});

test("a later render overwrites the single undo slot", async () => {
  const list = mount();
  await flush();
  const tpl = template("<li>{x}</li>");

  dispatchInteraction(list, "render", { template: tpl, swap: "beforeend", x: "one" });
  dispatchInteraction(list, "render", { template: tpl, swap: "beforeend", x: "two" });

  dispatchInteraction(list, "undo");
  assert.deepEqual([...list.children].map((row) => row.textContent), ["one"]);
});

test("undo with nothing recorded is a no-op", async () => {
  const list = mount();
  await flush();
  assert.doesNotThrow(() => dispatchInteraction(list, "undo"));
});

test("a supplied slot the template does not declare throws before insertion", async () => {
  const list = mount();
  await flush();
  const tpl = template("<li>{title}</li>");

  assert.throws(
    () =>
      dispatchInteraction(list, "render", { template: tpl, swap: "beforeend", title: "x", extra: "y" }),
    /slot "extra" is not declared/,
  );
  assert.equal(list.children.length, 0);
});

test("a declared slot with no supplied value throws before insertion", async () => {
  const list = mount();
  await flush();
  const tpl = template("<li>{title} {id}</li>");

  assert.throws(
    () => dispatchInteraction(list, "render", { template: tpl, swap: "beforeend", title: "x" }),
    /slot "\{id\}" has no value/,
  );
  assert.equal(list.children.length, 0);
});

test("a duplicate id throws before anything is inserted", async () => {
  const list = mount();
  await flush();
  const existing = document.createElement("li");
  existing.id = "row-9";
  document.body.appendChild(existing);
  const tpl = template('<li id="row-{id}">{x}</li>');

  assert.throws(
    () => dispatchInteraction(list, "render", { template: tpl, swap: "beforeend", id: 9, x: "x" }),
    /duplicate id "row-9"/,
  );
  assert.equal(list.children.length, 0);
});

test("render inserts a payload string as markup, without stamping slots", async () => {
  const list = mount();
  await flush();
  list.innerHTML = "<li>old</li>";

  dispatchInteraction(list, "render", { payload: "<li id='row-9'>{title}</li>", swap: "innerHTML" });

  assert.equal(list.children.length, 1);
  const row = list.children[0] as HTMLElement;
  assert.equal(row.id, "row-9");
  assert.equal(row.textContent, "{title}", "a payload is inserted verbatim, not stamped with slots");
});

test("render beforeend with a payload appends the markup in order", async () => {
  const list = mount();
  await flush();

  dispatchInteraction(list, "render", { payload: "<li>{a}</li><li>{b}</li>", swap: "beforeend" });

  assert.deepEqual([...list.children].map((row) => row.textContent), ["{a}", "{b}"]);
});

test("undo removes the rows a payload render appended", async () => {
  const list = mount();
  await flush();

  dispatchInteraction(list, "render", { payload: '<li class="new">{x}</li>', swap: "beforeend" });
  assert.equal(document.querySelectorAll(".new").length, 1);

  dispatchInteraction(list, "undo");
  assert.equal(document.querySelectorAll(".new").length, 0);
});

test("supplying both template and payload is a definition-time signature error", async () => {
  const list = mount();
  await flush();
  const tpl = template("<li>{x}</li>");

  assert.throws(
    () => dispatchInteraction(list, "render", { template: tpl, payload: "<li>y</li>", swap: "beforeend" }),
    /mutually exclusive/,
  );
  assert.equal(list.children.length, 0, "nothing is inserted");
});

test("a duplicate id in a payload throws before anything is inserted", async () => {
  const list = mount();
  await flush();
  const existing = document.createElement("li");
  existing.id = "row-9";
  document.body.appendChild(existing);

  assert.throws(
    () => dispatchInteraction(list, "render", { payload: '<li id="row-9">x</li>', swap: "beforeend" }),
    /duplicate id "row-9"/,
  );
  assert.equal(list.children.length, 0);
});

test("two elements sharing an id inside the clone throw before insertion", async () => {
  const list = mount();
  await flush();
  const tpl = template('<li id="row-{id}">a</li><li id="row-{id}">b</li>');

  assert.throws(
    () => dispatchInteraction(list, "render", { template: tpl, swap: "beforeend", id: 4 }),
    /duplicate id "row-4"/,
  );
  assert.equal(list.children.length, 0);
});

test("template is required for every swap except delete and none", async () => {
  const list = mount();
  await flush();

  assert.throws(() => dispatchInteraction(list, "render", { swap: "beforeend", x: "y" }), /template is required/);
  assert.throws(() => dispatchInteraction(list, "render", { swap: "innerHTML" }), /template is required/);
  assert.doesNotThrow(() => dispatchInteraction(list, "render", { swap: "none" }));

  list.innerHTML = "<li>row</li>";
  assert.doesNotThrow(() => dispatchInteraction(list, "render", { swap: "delete", target: "#list li" }));
});

test("a non-template value for template is rejected by the signature", async () => {
  const list = mount();
  await flush();
  const div = document.createElement("div");

  assert.throws(() => dispatchInteraction(list, "render", { template: div, swap: "beforeend" }));
});

test("an unresolved target throws", async () => {
  const list = mount();
  await flush();
  const tpl = template("<li>{x}</li>");

  assert.throws(
    () => dispatchInteraction(list, "render", { template: tpl, swap: "beforeend", target: "#nope", x: "x" }),
    /target "#nope" not found/,
  );
});

test("substitution reaches attribute values, so a stamped delete button targets its own row", async () => {
  const list = mount();
  await flush();
  const tpl = template(
    '<li id="row-{id}"><button on-click="#list.render({swap: \'delete\', target: \'#row-{id}\'})">x</button></li>',
  );

  dispatchInteraction(list, "render", { template: tpl, swap: "beforeend", id: 42 });
  const row = list.querySelector("li")!;
  assert.equal(row.id, "row-42");
  const button = row.querySelector("button")!;
  assert.ok(button.getAttribute("on-click")?.includes("#row-42"), "the attribute slot was filled");

  await flush();
  button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await flush();
  assert.equal(list.children.length, 0, "the stamped button deleted its own row");
});

interface FakeTransition {
  finished: Promise<void>;
  resolveFinished: () => void;
}

let transitions: FakeTransition[];

function installFakeTransition(): void {
  transitions = [];
  Object.defineProperty(document, "startViewTransition", {
    configurable: true,
    value: (callback: () => void): { finished: Promise<void> } => {
      callback();
      let resolveFinished!: () => void;
      const finished = new Promise<void>((resolve) => {
        resolveFinished = resolve;
      });
      transitions.push({ finished, resolveFinished });
      return { finished };
    },
  });
}

function restoreFakeTransition(): void {
  delete (document as unknown as { startViewTransition?: unknown }).startViewTransition;
}

test("fallback path fires rendered immediately after the mutation", async () => {
  const list = mount();
  await flush();
  const tpl = template("<li>{x}</li>");
  const seen: string[] = [];
  list.addEventListener("rendered", () => seen.push("rendered"));

  dispatchInteraction(list, "render", { template: tpl, swap: "beforeend", x: "a" });

  assert.equal(list.children.length, 1);
  assert.deepEqual(seen, ["rendered"]);
});

test("wrapped path fires rendered after finished resolves", async (t) => {
  const list = mount();
  await flush();
  const tpl = template("<li>{x}</li>");
  const seen: string[] = [];
  list.addEventListener("rendered", () => seen.push("rendered"));
  installFakeTransition();
  t.after(restoreFakeTransition);

  dispatchInteraction(list, "render", { template: tpl, swap: "beforeend", x: "a" });

  assert.equal(list.children.length, 1, "the fake runs the mutation synchronously");
  assert.equal(transitions.length, 1, "the swap wrapped in a view transition");
  assert.deepEqual(seen, [], "rendered waits for finished");

  transitions[0]!.resolveFinished();
  await flush();
  assert.deepEqual(seen, ["rendered"], "rendered fires once the transition settles");
});

test("renderable-disable-view-transition skips the wrap even with the fake installed", async (t) => {
  const list = mount();
  await flush();
  list.setAttribute("renderable-disable-view-transition", "");
  const tpl = template("<li>{x}</li>");
  const seen: string[] = [];
  list.addEventListener("rendered", () => seen.push("rendered"));
  installFakeTransition();
  t.after(restoreFakeTransition);

  dispatchInteraction(list, "render", { template: tpl, swap: "beforeend", x: "a" });

  assert.equal(transitions.length, 0, "the swap bypasses startViewTransition");
  assert.equal(list.children.length, 1);
  assert.deepEqual(seen, ["rendered"], "the fallback fires rendered immediately");
});

test("rendered does not fire for swap none", async (t) => {
  const list = mount();
  await flush();
  list.innerHTML = "<li>kept</li>";
  const seen: string[] = [];
  list.addEventListener("rendered", () => seen.push("rendered"));
  installFakeTransition();
  t.after(restoreFakeTransition);

  dispatchInteraction(list, "render", { swap: "none" });

  assert.equal(transitions.length, 0);
  assert.deepEqual(seen, []);
  assert.equal(list.textContent, "kept");
});

test("rendered does not fire when a slot or id validation throws", async (t) => {
  const list = mount();
  await flush();
  const seen: string[] = [];
  list.addEventListener("rendered", () => seen.push("rendered"));
  installFakeTransition();
  t.after(restoreFakeTransition);

  assert.throws(
    () =>
      dispatchInteraction(list, "render", {
        template: template("<li>{title}</li>"),
        swap: "beforeend",
        title: "x",
        extra: "y",
      }),
    /slot "extra" is not declared/,
  );
  assert.throws(
    () =>
      dispatchInteraction(list, "render", {
        template: template('<li id="row-{id}">a</li><li id="row-{id}">b</li>'),
        swap: "beforeend",
        id: 4,
      }),
    /duplicate id "row-4"/,
  );
  assert.equal(transitions.length, 0, "validation happens before the wrap");
  assert.deepEqual(seen, []);
});

test("undo reverses while a transition is pending", async (t) => {
  const list = mount();
  await flush();
  const tpl = template("<li>{x}</li>");
  installFakeTransition();
  t.after(restoreFakeTransition);

  dispatchInteraction(list, "render", { template: tpl, swap: "beforeend", x: "a" });
  assert.equal(list.children.length, 1);

  dispatchInteraction(list, "undo");
  assert.equal(list.children.length, 0, "undo reverses without waiting for finished");

  transitions[0]!.resolveFinished();
  await flush();
});
