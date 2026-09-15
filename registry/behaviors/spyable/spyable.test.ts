import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import type { JSDOM } from "jsdom";
import { setupJsdom, teardownJsdom, flush } from "@tests/jsdom.ts";
import "@behaviors/spyable/spyable.ts";
import { defineInteractableHost } from "@behaviors/interactable-host.ts";

let dom: JSDOM;

before(() => {
  dom = setupJsdom();
  defineInteractableHost("nav");
});

after(() => {
  teardownJsdom(dom);
});

beforeEach(() => {
  document.body.replaceChildren();
});

const rect = (top: number): DOMRect =>
  ({ top, bottom: top, left: 0, right: 0, width: 0, height: 0, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;

function stubTop(el: Element, get: () => number): void {
  (el as unknown as { getBoundingClientRect: () => DOMRect }).getBoundingClientRect = () => rect(get());
}

interface Fixture {
  nav: HTMLElement;
  a: HTMLElement;
  b: HTMLElement;
  c: HTMLElement;
}

async function fixture(attributes: Record<string, string> = {}): Promise<Fixture> {
  const nav = document.createElement("nav", { is: "interactable-nav" });
  nav.setAttribute("implements", "spyable");
  for (const [name, value] of Object.entries(attributes)) nav.setAttribute(name, value);
  for (const id of ["a", "b", "c"]) {
    const link = document.createElement("a");
    link.setAttribute("href", `#${id}`);
    link.setAttribute("id", `link-${id}`);
    nav.appendChild(link);
  }
  document.body.appendChild(nav);
  const a = document.createElement("section");
  a.id = "a";
  const b = document.createElement("section");
  b.id = "b";
  const c = document.createElement("section");
  c.id = "c";
  document.body.append(a, b, c);
  await flush();
  return { nav, a, b, c };
}

function activeIds(): string[] {
  return [...document.querySelectorAll("a[data-active]")].map((link) => link.id);
}

function scroll(): void {
  window.dispatchEvent(new Event("scroll"));
}

test("spyable marks the first link when no section has crossed the line", async () => {
  const { a, b, c } = await fixture();
  stubTop(a, () => 120);
  stubTop(b, () => 500);
  stubTop(c, () => 900);
  scroll();
  assert.deepEqual(activeIds(), ["link-a"]);
  assert.equal(document.getElementById("link-a")!.getAttribute("aria-current"), "location");
});

test("spyable follows the last section whose top crossed the line", async () => {
  const { a, b, c } = await fixture();
  let aTop = -400;
  let bTop = 200;
  let cTop = 800;
  stubTop(a, () => aTop);
  stubTop(b, () => bTop);
  stubTop(c, () => cTop);

  scroll();
  assert.deepEqual(activeIds(), ["link-a"]);

  bTop = -20;
  scroll();
  assert.deepEqual(activeIds(), ["link-b"]);

  cTop = -5;
  scroll();
  assert.deepEqual(activeIds(), ["link-c"]);
  assert.equal(document.querySelectorAll("a[aria-current]").length, 1);
});

test("spyable-offset moves the activation line down the viewport", async () => {
  const { a, b, c } = await fixture({ "spyable-offset": "100" });
  stubTop(a, () => -500);
  stubTop(b, () => 50);
  stubTop(c, () => 500);

  scroll();
  assert.deepEqual(activeIds(), ["link-b"]);
});

test("spyable ignores links without a resolvable target", async () => {
  const nav = document.createElement("nav", { is: "interactable-nav" });
  nav.setAttribute("implements", "spyable");
  nav.innerHTML = '<a href="#missing" id="link-missing">Missing</a><a href="#present" id="link-present">Present</a>';
  const present = document.createElement("section");
  present.id = "present";
  document.body.append(nav, present);
  await flush();
  stubTop(present, () => -1);

  scroll();
  assert.deepEqual(activeIds(), ["link-present"]);
  assert.equal(document.getElementById("link-missing")!.hasAttribute("data-active"), false);
});

test("spyable stops listening once disconnected", async () => {
  const { nav, a, b, c } = await fixture();
  const link = document.getElementById("link-a")!;
  stubTop(a, () => -1);
  stubTop(b, () => 500);
  stubTop(c, () => 900);
  scroll();
  assert.deepEqual(activeIds(), ["link-a"]);

  nav.remove();
  await flush();
  link.removeAttribute("data-active");
  scroll();
  assert.deepEqual(activeIds(), []);
});
