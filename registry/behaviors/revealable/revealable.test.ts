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
  for (const [name, value] of Object.entries(attributes)) el.setAttribute(name, value);
  return el;
}

function interact(el: Element, verb: string, source?: Element): InstanceType<typeof InteractionEventClass> {
  const event = new InteractionEventClass({
    verb,
    arg: undefined,
    source: source ?? el,
    originalEvent: new Event("interaction"),
  });
  el.dispatchEvent(event);
  return event;
}

test("<details>: show/hide/toggle write and read el.open", async () => {
  const details = hostElement("details", { implements: "revealable" }) as HTMLDetailsElement;
  document.body.appendChild(details);
  await flush();

  assert.equal(details.open, false);
  interact(details, "show");
  assert.equal(details.open, true);
  assert.equal(details.hasAttribute("data-open"), false);

  interact(details, "toggle");
  assert.equal(details.open, false);

  interact(details, "hide");
  assert.equal(details.open, false);

  interact(details, "toggle");
  interact(details, "toggle");
  assert.equal(details.open, false);
});

test("<dialog>: show()/hide()/toggle() via showModal, and show() when revealable-modal=false", async () => {
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

  interact(dialog, "hide");
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

test("[popover]: show/hide/toggle use showPopover and read :popover-open", async () => {
  const el = hostElement("div", { implements: "revealable", popover: "" });
  document.body.appendChild(el);
  await flush();

  assert.equal(el.matches(":popover-open"), false);
  interact(el, "show");
  assert.equal(el.matches(":popover-open"), true);

  interact(el, "toggle");
  assert.equal(el.matches(":popover-open"), false);

  interact(el, "hide");
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
  interact(panel, "hide");
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

  interact(panel, "show", bare);
  assert.equal(bare.getAttribute("aria-controls"), "panel");
  assert.equal(bare.getAttribute("aria-expanded"), "true");
  assert.equal(declared.getAttribute("aria-expanded"), "true");

  interact(panel, "hide", declared);
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

  const event = new InteractionEventClass({
    verb: "hide",
    arg: undefined,
    source: tabB,
    originalEvent: new Event("interaction"),
  });
  auto.dispatchEvent(event);
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