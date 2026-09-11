import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import type { JSDOM } from "jsdom";
import { setupJsdom, teardownJsdom, flush } from "../../tests/jsdom.ts";

let dom: JSDOM;
let dispatchInteraction: typeof import("./test-harness.ts").dispatchInteraction;
let fire: typeof import("./test-harness.ts").fire;
let defineImplementation: typeof import("./_implementation-definition.ts").defineImplementation;
let defineInteractableHost: typeof import("./interactable-host.ts").defineInteractableHost;
const received: string[] = [];

before(async () => {
  dom = setupJsdom();
  ({ dispatchInteraction, fire } = await import("./test-harness.ts"));
  ({ defineImplementation } = await import("./_implementation-definition.ts"));
  ({ defineInteractableHost } = await import("./interactable-host.ts"));

  defineImplementation(
    "echoer",
    {
      tags: ["div"],
      config: { prefix: "string | undefined" },
      verbs: { echo: "string", boom: "undefined" },
    },
    (_el) => ({
      echo: (_e, value) => {
        received.push(value as string);
        return value;
      },
      boom: () => {
        throw new Error("kaboom");
      },
    }),
  );

  defineInteractableHost("div");
  defineInteractableHost("button");
});

after(() => {
  teardownJsdom(dom);
});

beforeEach(() => {
  received.length = 0;
  document.body.replaceChildren();
});

function hostElement(tag: string, attributes: Record<string, string>): HTMLElement {
  const el = document.createElement(tag, { is: `interactable-${tag}` }) as HTMLElement;
  for (const [name, value] of Object.entries(attributes)) el.setAttribute(name, value);
  return el;
}

test("dispatchInteraction dispatches, checks handled, rethrows e.error and returns e.result", async () => {
  const receiver = hostElement("div", { id: "recv", implements: "echoer" });
  document.body.appendChild(receiver);
  await flush();

  const result = dispatchInteraction(receiver, "echo", "hi");
  assert.equal(result, "hi");
  assert.deepEqual(received, ["hi"]);

  assert.throws(() => dispatchInteraction(receiver, "boom"), /kaboom/);
  assert.throws(() => dispatchInteraction(receiver, "ghost"), /handles ghost/);
});

test("fire dispatches a real DOM event on an upgraded trigger through the full path", async () => {
  const receiver = hostElement("div", { id: "recv2", implements: "echoer" });
  const trigger = hostElement("button", { "on-click": "#recv2.echo('clicked')" });
  document.body.append(trigger, receiver);
  await flush();

  fire(trigger, "click", { bubbles: true });
  assert.deepEqual(received, ["clicked"]);
});