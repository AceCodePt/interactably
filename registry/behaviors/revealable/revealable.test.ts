import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import type { JSDOM } from "jsdom";
import { setupJsdom, teardownJsdom, flush } from "@tests/jsdom.ts";

let dom: JSDOM;
let InteractionEventClass: typeof import("@interactable/interaction-event.ts").InteractionEvent;
let defineInteractableHost: typeof import("@behaviors/interactable-host.ts").defineInteractableHost;

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
  ({ defineInteractableHost } = await import("@behaviors/interactable-host.ts"));
  defineInteractableHost("details");
  defineInteractableHost("dialog");
  defineInteractableHost("div");
  defineInteractableHost("section");
  defineInteractableHost("button");
  defineInteractableHost("input");
});

after(() => {
  teardownJsdom(dom);
});

beforeEach(() => {
  dialogCalls.length = 0;
  document.body.replaceChildren();
});

function hostElement(tag: string, attributes: Record<string, string>): HTMLElement {
  const el = document.createElement(tag, { is: `interactable-${tag}` }) as HTMLElement;
  el.setAttribute("is", `interactable-${tag}`);
  for (const [name, value] of Object.entries(attributes)) el.setAttribute(name, value);
  return el;
}

function radio(attributes: Record<string, string>): HTMLInputElement {
  const el = document.createElement("input");
  el.type = "radio";
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
  assert.equal(details.hasAttribute("data-open"), false);

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

test("a plain element falls back to data-open and renders hidden from it", async () => {
  const panel = hostElement("div", { implements: "revealable", hidden: "" });
  document.body.appendChild(panel);
  await flush();

  assert.equal(panel.hidden, true);
  assert.equal(panel.getAttribute("data-open"), null);

  interact(panel, "show");
  assert.equal(panel.getAttribute("data-open"), "true");
  assert.equal(panel.hidden, false);

  interact(panel, "toggle");
  assert.equal(panel.hasAttribute("data-open"), false);
  assert.equal(panel.hidden, true);

  interact(panel, "show");
  interact(panel, "show", false);
  assert.equal(panel.hasAttribute("data-open"), false);
  assert.equal(panel.hidden, true);
});

test("authored data-open renders at connect", async () => {
  const open = hostElement("div", { implements: "revealable", "data-open": "true" });
  document.body.appendChild(open);
  await flush();
  assert.equal(open.hidden, false);

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

test("a radio source closes sibling panels across strategies", async () => {
  const p1 = hostElement("div", { implements: "revealable", id: "p1", hidden: "" });
  const p2 = hostElement("div", { implements: "revealable", id: "p2", hidden: "" });
  const p3 = hostElement("div", { implements: "revealable", id: "p3", popover: "" });
  const r1 = radio({ name: "g", "on-change": "#p1.show()" });
  const r2 = radio({ name: "g", "on-change": "#p2.show()" });
  const r3 = radio({ name: "g", "on-change": "#p3.show()" });
  document.body.append(p1, p2, p3, r1, r2, r3);
  await flush();

  interact(p2, "show");
  interact(p3, "show");
  assert.equal(p2.hidden, false);
  assert.equal(p3.matches(":popover-open"), true);

  interact(p1, "show", undefined, r1);
  assert.equal(p1.hidden, false);
  assert.equal(p2.hidden, true, "the sibling's panel closes");
  assert.equal(p3.matches(":popover-open"), false, "the popover sibling's panel closes");
});

test("a radio in a different form with the same name is not a sibling", async () => {
  const p1 = hostElement("div", { implements: "revealable", id: "p1", hidden: "" });
  const p2 = hostElement("div", { implements: "revealable", id: "p2", hidden: "" });
  const form1 = document.createElement("form");
  const form2 = document.createElement("form");
  const r1 = radio({ name: "g", "on-change": "#p1.show()" });
  const r2 = radio({ name: "g", "on-change": "#p2.show()" });
  form1.appendChild(r1);
  form2.appendChild(r2);
  document.body.append(p1, p2, form1, form2);
  await flush();

  assert.equal(r1.form, form1);
  assert.equal(r2.form, form2);

  interact(p2, "show");
  assert.equal(p2.hidden, false);

  interact(p1, "show", undefined, r1);
  assert.equal(p1.hidden, false);
  assert.equal(p2.hidden, false, "a radio in another form is not a sibling");
});

test("a checkbox source closes nothing", async () => {
  const p1 = hostElement("div", { implements: "revealable", id: "p1", hidden: "" });
  const p2 = hostElement("div", { implements: "revealable", id: "p2", hidden: "" });
  const r1 = radio({ name: "g", "on-change": "#p1.show()" });
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.name = "g";
  checkbox.setAttribute("on-change", "#p2.show()");
  document.body.append(p1, p2, r1, checkbox);
  await flush();

  interact(p2, "show");
  assert.equal(p2.hidden, false);

  interact(p1, "show", undefined, checkbox);
  assert.equal(p1.hidden, false);
  assert.equal(p2.hidden, false, "a checkbox source closes nothing");
});

test("a button source closes nothing", async () => {
  const p1 = hostElement("div", { implements: "revealable", id: "p1", hidden: "" });
  const p2 = hostElement("div", { implements: "revealable", id: "p2", hidden: "" });
  const r1 = radio({ name: "g", "on-change": "#p1.show()" });
  const r2 = radio({ name: "g", "on-change": "#p2.show()" });
  const button = document.createElement("button");
  button.setAttribute("on-click", "#p2.show()");
  document.body.append(p1, p2, r1, r2, button);
  await flush();

  interact(p2, "show");
  assert.equal(p2.hidden, false);

  interact(p1, "show", undefined, button);
  assert.equal(p1.hidden, false);
  assert.equal(p2.hidden, false, "a button source closes nothing");
});

test("a sibling whose phrase names a non-revealable id is skipped", async () => {
  const p1 = hostElement("div", { implements: "revealable", id: "p1", hidden: "" });
  const plain = document.createElement("div");
  plain.id = "plain";
  const r1 = radio({ name: "g", "on-change": "#p1.show()" });
  const r2 = radio({ name: "g", "on-change": "#plain.show()" });
  document.body.append(p1, plain, r1, r2);
  await flush();

  interact(p1, "show", undefined, r1);
  assert.equal(p1.hidden, false);
  assert.equal(plain.hasAttribute("data-open"), false);
});

test("a sibling with only show(false) targets closes nothing", async () => {
  const p1 = hostElement("div", { implements: "revealable", id: "p1", hidden: "" });
  const p2 = hostElement("div", { implements: "revealable", id: "p2", hidden: "" });
  const r1 = radio({ name: "g", "on-change": "#p1.show()" });
  const r2 = radio({ name: "g", "on-change": "#p2.show(false)" });
  document.body.append(p1, p2, r1, r2);
  await flush();

  interact(p2, "show");
  assert.equal(p2.hidden, false);

  interact(p1, "show", undefined, r1);
  assert.equal(p1.hidden, false);
  assert.equal(p2.hidden, false, "show(false) is a side effect, not control");
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

test("a radio with an empty name closes nothing", async () => {
  const p1 = hostElement("div", { implements: "revealable", id: "p1", hidden: "" });
  const p2 = hostElement("div", { implements: "revealable", id: "p2", hidden: "" });
  const r1 = radio({ name: "", "on-change": "#p1.show()" });
  const r2 = radio({ name: "", "on-change": "#p2.show()" });
  document.body.append(p1, p2, r1, r2);
  await flush();

  interact(p2, "show");
  assert.equal(p2.hidden, false);

  interact(p1, "show", undefined, r1);
  assert.equal(p1.hidden, false);
  assert.equal(p2.hidden, false, "an empty-name radio is not a group");
});

test("a sibling naming a non-existent id is skipped silently", async () => {
  const p1 = hostElement("div", { implements: "revealable", id: "p1", hidden: "" });
  const p2 = hostElement("div", { implements: "revealable", id: "p2", hidden: "" });
  const r1 = radio({ name: "g", "on-change": "#p1.show()" });
  const r2 = radio({ name: "g", "on-change": "#ghost.show()" });
  document.body.append(p1, p2, r1, r2);
  await flush();

  interact(p2, "show");
  assert.equal(p2.hidden, false);

  interact(p1, "show", undefined, r1);
  assert.equal(p1.hidden, false);
  assert.equal(p2.hidden, false, "the sibling's ghost target is skipped, p2 stays open");
});

test("the sibling-closing no-source path refreshes button controllers and leaves the radio source untouched", async () => {
  const r2 = hostElement("input", { type: "radio", name: "g", "on-change": "#p2.show()" });
  const p1 = hostElement("div", { implements: "revealable", id: "p1", hidden: "" });
  const p2 = hostElement("div", { implements: "revealable", id: "p2", hidden: "" });
  const button = document.createElement("button");
  button.setAttribute("aria-controls", "p2");
  const r1 = radio({ name: "g", "on-change": "#p1.show()" });
  document.body.append(r2, p1, p2, button, r1);
  await flush();

  assert.equal(button.getAttribute("aria-controls"), "p2");
  assert.equal(r2.getAttribute("aria-controls"), "p2", "the sibling radio is wired at connect");

  interact(p2, "show");
  assert.equal(p2.hidden, false);
  assert.equal(button.getAttribute("aria-expanded"), "true");

  interact(p1, "show", undefined, r1);
  assert.equal(p1.hidden, false);
  assert.equal(p2.hidden, true, "the sibling panel closes");
  assert.equal(button.getAttribute("aria-expanded"), "false", "the button controller is refreshed");
  assert.equal(r2.getAttribute("aria-expanded"), null, "the radio source gets no aria-expanded");
});
