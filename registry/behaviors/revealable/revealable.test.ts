import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import type { JSDOM } from "jsdom";
import { setupJsdom, teardownJsdom, flush } from "@tests/jsdom.ts";

let dom: JSDOM;
let dispose: () => void;
let start: typeof import("@interactable/start.ts").start;
let InteractionEventClass: typeof import("@interactable/interaction-event.ts").InteractionEvent;
let isImplementationEvent: (el: Element, type: string) => boolean;

const dialogCalls: string[] = [];

function installPlatformPolyfills(): void {
  const dialogProto = HTMLDialogElement.prototype as unknown as Record<
    string,
    (this: HTMLDialogElement) => void
  >;
  dialogProto["showModal"] = function () {
    dialogCalls.push("showModal");
    this.open = true;
  };
  dialogProto["show"] = function () {
    dialogCalls.push("show");
    this.open = true;
  };
  dialogProto["close"] = function () {
    dialogCalls.push("close");
    this.open = false;
  };

  const popoverState = new WeakSet<HTMLElement>();
  const htmlProto = HTMLElement.prototype as unknown as Record<string, unknown>;
  htmlProto["showPopover"] = function (this: HTMLElement) {
    popoverState.add(this);
  };
  htmlProto["hidePopover"] = function (this: HTMLElement) {
    popoverState.delete(this);
  };
  const nativeMatches = HTMLElement.prototype.matches;
  (
    HTMLElement.prototype as unknown as Record<string, (this: HTMLElement, selector: string) => boolean>
  )["matches"] = function (this: HTMLElement, selector: string) {
    if (selector === ":popover-open") return popoverState.has(this);
    return nativeMatches.call(this, selector);
  };
}

before(async () => {
  dom = setupJsdom();
  installPlatformPolyfills();
  await import("@behaviors/revealable/revealable.ts");
  ({ InteractionEvent: InteractionEventClass } = await import("@interactable/interaction-event.ts"));
  ({ isImplementationEvent } = await import("@interactable/events.ts"));
                ({ start } = await import("@interactable/start.ts"));
  dispose = start();
});

after(() => {
  dispose();
  teardownJsdom(dom);
});

beforeEach(() => {
  dialogCalls.length = 0;
  document.body.replaceChildren();
});

function hostElement(tag: string, attributes: Record<string, string>): HTMLElement {
  const el = document.createElement(tag) as HTMLElement;
  el.setAttribute("is", `interactable-${tag}`);
  for (const [name, value] of Object.entries(attributes)) el.setAttribute(name, value);
  return el;
}

function interact(
  el: Element,
  verb: string,
  arg?: unknown,
  source?: Element,
): InstanceType<typeof InteractionEventClass> {
  const event = new InteractionEventClass({
    verb,
    arg,
    source: source ?? el,
    originalEvent: new Event("interaction"),
  });
  el.dispatchEvent(event);
  return event;
}

test("<details>: show()/show(true)/show(false)/toggle() write and read el.open", async () => {
  const details = hostElement("details", { implements: "revealable" }) as HTMLDetailsElement;
  document.body.appendChild(details);
  await flush();

  assert.equal(details.open, false);
  interact(details, "show");
  assert.equal(details.open, true);
  assert.equal(details.hasAttribute("revealable-open"), false);

  interact(details, "toggle");
  assert.equal(details.open, false);

  interact(details, "show", false);
  assert.equal(details.open, false);

  interact(details, "toggle");
  interact(details, "toggle");
  assert.equal(details.open, false);

  interact(details, "show", true);
  assert.equal(details.open, true);
});

test("<dialog>: show()/show(false)/toggle() via showModal, and show() when revealable-modal=false", async () => {
  const dialog = hostElement("dialog", { implements: "revealable" }) as HTMLDialogElement;
  document.body.appendChild(dialog);
  await flush();

  interact(dialog, "show");
  assert.equal(dialog.open, true);
  assert.deepEqual(dialogCalls, ["showModal"]);

  interact(dialog, "toggle");
  assert.equal(dialog.open, false);
  assert.deepEqual(dialogCalls, ["showModal", "close"]);

  interact(dialog, "toggle");
  assert.equal(dialog.open, true);
  assert.deepEqual(dialogCalls, ["showModal", "close", "showModal"]);

  interact(dialog, "show", false);
  assert.equal(dialog.open, false);

  dialogCalls.length = 0;
  const modal = hostElement("dialog", { implements: "revealable", "revealable-modal": "false" }) as HTMLDialogElement;
  document.body.appendChild(modal);
  await flush();
  interact(modal, "show");
  assert.equal(modal.open, true);
  assert.deepEqual(dialogCalls, ["show"]);
});

test("a dialog that is already open is not re-shown", async () => {
  const dialog = hostElement("dialog", { implements: "revealable" }) as HTMLDialogElement;
  document.body.appendChild(dialog);
  await flush();

  interact(dialog, "show");
  dialogCalls.length = 0;
  interact(dialog, "show");
  assert.equal(dialog.open, true);
  assert.deepEqual(dialogCalls, []);
});

test("[popover]: show/show(false)/toggle use showPopover and read :popover-open", async () => {
  const el = hostElement("div", { implements: "revealable", popover: "" });
  document.body.appendChild(el);
  await flush();

  assert.equal(el.matches(":popover-open"), false);
  interact(el, "show");
  assert.equal(el.matches(":popover-open"), true);

  interact(el, "toggle");
  assert.equal(el.matches(":popover-open"), false);

  interact(el, "show", false);
  assert.equal(el.matches(":popover-open"), false);

  interact(el, "toggle");
  assert.equal(el.matches(":popover-open"), true);
});

test("a plain element falls back to revealable-open and renders hidden from it", async () => {
  const panel = hostElement("div", { implements: "revealable", hidden: "" });
  document.body.appendChild(panel);
  await flush();

  assert.equal(panel.hidden, true);
  assert.equal(panel.getAttribute("revealable-open"), null);

  interact(panel, "show");
  assert.equal(panel.getAttribute("revealable-open"), "true");
  await flush();
  assert.equal(panel.hidden, false);

  interact(panel, "toggle");
  assert.equal(panel.hasAttribute("revealable-open"), false);
  await flush();
  assert.equal(panel.hidden, true);

  interact(panel, "show");
  interact(panel, "show", false);
  assert.equal(panel.hasAttribute("revealable-open"), false);
  await flush();
  assert.equal(panel.hidden, true);
});

test("authored revealable-open renders at connect", async () => {
  const open = hostElement("div", { implements: "revealable", "revealable-open": "true" });
  document.body.appendChild(open);
  await flush();
  assert.equal(open.hidden, false);
  assert.equal(open.getAttribute("revealable-open"), "true", "connect reads revealable-open; it does not rewrite or remove it");

  const closed = hostElement("div", { implements: "revealable" });
  document.body.appendChild(closed);
  await flush();
  assert.equal(closed.hidden, true);
});

test("ARIA sync wires up a bare trigger and sets aria-expanded on every controller", async () => {
  const panel = hostElement("section", { implements: "revealable", id: "panel", hidden: "" });
  const bare = document.createElement("button");
  const declared = document.createElement("button");
  declared.setAttribute("aria-controls", "panel");
  document.body.append(panel, bare, declared);
  await flush();

  interact(panel, "show", undefined, bare);
  assert.equal(bare.getAttribute("aria-controls"), "panel");
  assert.equal(bare.getAttribute("aria-expanded"), "true");
  assert.equal(declared.getAttribute("aria-expanded"), "true");

  interact(panel, "show", false, declared);
  assert.equal(bare.getAttribute("aria-expanded"), "false");
  assert.equal(declared.getAttribute("aria-expanded"), "false");
});

test("a trigger of one panel is not rewritten when it triggers another panel", async () => {
  const auto = hostElement("section", { implements: "revealable", id: "tab-auto", hidden: "" });
  const is = hostElement("section", { implements: "revealable", id: "tab-is", hidden: "" });
  const tabA = document.createElement("button");
  tabA.setAttribute("aria-controls", "tab-auto");
  const tabB = document.createElement("button");
  tabB.setAttribute("aria-controls", "tab-is");
  document.body.append(auto, is, tabA, tabB);
  await flush();

  tabA.setAttribute("aria-expanded", "true");
  tabB.setAttribute("aria-expanded", "false");

  auto.dispatchEvent(
    new InteractionEventClass({
      verb: "show",
      arg: false,
      source: tabB,
      originalEvent: new Event("interaction"),
    }),
  );
  is.dispatchEvent(
    new InteractionEventClass({
      verb: "show",
      arg: undefined,
      source: tabB,
      originalEvent: new Event("interaction"),
    }),
  );

  assert.equal(tabB.getAttribute("aria-controls"), "tab-is", "the trigger's own aria-controls is untouched");
  assert.equal(tabA.getAttribute("aria-expanded"), "false");
  assert.equal(tabB.getAttribute("aria-expanded"), "true");
});

test("no ARIA sync when the element triggers itself", async () => {
  const panel = hostElement("div", { implements: "revealable", id: "self", hidden: "" });
  document.body.appendChild(panel);
  await flush();

  interact(panel, "show");
  assert.equal(panel.getAttribute("aria-expanded"), null);
  assert.equal(panel.getAttribute("aria-controls"), null);
});

test("wiring: a button controlling #p gets aria-controls and aria-expanded when #p connects", async () => {
  const button = hostElement("button", { "on-click": "#p.show()" });
  document.body.appendChild(button);
  const panel = hostElement("section", { implements: "revealable", id: "p", hidden: "" });
  document.body.appendChild(panel);
  await flush();

  assert.equal(button.getAttribute("aria-controls"), "p");
  assert.equal(button.getAttribute("aria-expanded"), "false");
});

test("wiring: a radio gets aria-controls but no aria-expanded", async () => {
  const input = hostElement("input", { type: "radio", name: "g", "on-change": "#p.show()" });
  document.body.appendChild(input);
  const panel = hostElement("section", { implements: "revealable", id: "p", hidden: "" });
  document.body.appendChild(panel);
  await flush();

  assert.equal(input.getAttribute("aria-controls"), "p");
  assert.equal(input.getAttribute("aria-expanded"), null);
});

test("wiring: a host controlling another panel is not wired", async () => {
  const button = hostElement("button", { "on-click": "#px.show()" });
  document.body.appendChild(button);
  const panel = hostElement("section", { implements: "revealable", id: "p", hidden: "" });
  document.body.appendChild(panel);
  await flush();

  assert.equal(button.getAttribute("aria-controls"), null);
  assert.equal(button.getAttribute("aria-expanded"), null);
});

test("wiring: existing aria-controls tokens are preserved", async () => {
  const button = hostElement("button", { "aria-controls": "other", "on-click": "#p.show()" });
  document.body.appendChild(button);
  const panel = hostElement("section", { implements: "revealable", id: "p", hidden: "" });
  document.body.appendChild(panel);
  await flush();

  assert.equal(button.getAttribute("aria-controls"), "other p");
});

test("wiring: a #p.show(false)-only host is not wired", async () => {
  const button = hostElement("button", { "on-click": "#p.show(false)" });
  document.body.appendChild(button);
  const panel = hostElement("section", { implements: "revealable", id: "p", hidden: "" });
  document.body.appendChild(panel);
  await flush();

  assert.equal(button.getAttribute("aria-controls"), null);
  assert.equal(button.getAttribute("aria-expanded"), null);
});

test("wiring: a mixed #a.show(); #b.show(false) host wires only a", async () => {
  const button = hostElement("button", { "on-click": "#a.show(); #b.show(false)" });
  document.body.appendChild(button);
  const a = hostElement("section", { implements: "revealable", id: "a", hidden: "" });
  const b = hostElement("section", { implements: "revealable", id: "b", hidden: "" });
  document.body.append(a, b);
  await flush();

  assert.equal(button.getAttribute("aria-controls"), "a");
  assert.equal(button.getAttribute("aria-expanded"), "false");
});

test("syncAria does not write aria-controls onto a show(false) source", async () => {
  const panel = hostElement("section", { implements: "revealable", id: "panel", hidden: "" });
  const bare = document.createElement("button");
  document.body.append(panel, bare);
  await flush();

  interact(panel, "show", false, bare);
  assert.equal(bare.getAttribute("aria-controls"), null);
  assert.equal(bare.getAttribute("aria-expanded"), null);
});

test("wiring: a #p.show(this.checked) host is not wired, but claims at fire time from the resolved value", async () => {
  const input = hostElement("input", {
    type: "radio",
    name: "g",
    checked: "checked",
    "on-change": "#p.show(this.checked)",
  });
  document.body.appendChild(input);
  const panel = hostElement("section", { implements: "revealable", id: "p", hidden: "" });
  document.body.appendChild(panel);
  await flush();

  assert.equal(input.getAttribute("aria-controls"), null, "a non-literal argument is not control at connect");
  assert.equal(input.getAttribute("aria-expanded"), null);

  interact(panel, "show", true, input);
  assert.equal(input.getAttribute("aria-controls"), "p", "the resolved value (true) claims at fire time");
});

test("wiring: a #p.show(true) host is wired", async () => {
  const button = hostElement("button", { "on-click": "#p.show(true)" });
  document.body.appendChild(button);
  const panel = hostElement("section", { implements: "revealable", id: "p", hidden: "" });
  document.body.appendChild(panel);
  await flush();

  assert.equal(button.getAttribute("aria-controls"), "p");
  assert.equal(button.getAttribute("aria-expanded"), "false");
});

test("a show() from a checked radio leaves a same-name sibling's open panel open", async () => {
  const rA = hostElement("input", { type: "radio", name: "g", id: "r-a", checked: "checked", "on-change": "#a.show()" }) as HTMLInputElement;
  const rB = hostElement("input", { type: "radio", name: "g", id: "r-b", "on-change": "#b.show()" }) as HTMLInputElement;
  const a = hostElement("div", { implements: "revealable", id: "a", hidden: "" });
  const b = hostElement("div", { implements: "revealable", id: "b", "revealable-open": "true" });
  document.body.append(rA, rB, a, b);
  await flush();

  interact(a, "show", undefined, rA);
  await flush();
  assert.equal(a.hidden, false);
  assert.equal(b.hidden, false, "the sibling's open panel stays open: nothing closes a panel unless a phrase says show(false)");
  assert.equal(rA.checked, true, "the radio source is untouched");
});

test("on-load fires at attach: this.show() reveals the panel once implementations are wired", async () => {
  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => warnings.push(args.map(String).join(" "));
  try {
    const p = hostElement("div", { implements: "revealable", id: "p", "on-load": "this.show()" });
    document.body.appendChild(p);
    await flush();
    assert.equal(p.hidden, false, "on-load ran this.show() after revealable attached");
    assert.equal(isImplementationEvent(p, "load"), false, "not a synthetic trigger");
    assert.equal(warnings.length, 0, "on-load binds no listener and warns nothing");
  } finally {
    console.warn = originalWarn;
  }
});
