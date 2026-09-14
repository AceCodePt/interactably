import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import type { JSDOM } from "jsdom";
import { setupJsdom, teardownJsdom, flush } from "@tests/jsdom.ts";
import type { InteractionEvent } from "@interactable/interaction-event.ts";

interface FakeResponse {
  ok: boolean;
  status: number;
  text(): Promise<string>;
}

interface FetchCall {
  url: string;
  init: RequestInit;
  signal: AbortSignal | null;
  resolve(response: FakeResponse): void;
  reject(error: unknown): void;
}

let dom: JSDOM;
let InteractionEventClass: typeof import("@interactable/interaction-event.ts").InteractionEvent;
let defineInteractableHost: typeof import("@behaviors/interactable-host.ts").defineInteractableHost;

const fetchCalls: FetchCall[] = [];

before(async () => {
  dom = setupJsdom();
  installFetch();
  await import("@behaviors/requestable/requestable.ts");
  await import("@behaviors/revealable/revealable.ts");
  ({ InteractionEvent: InteractionEventClass } = await import("@interactable/interaction-event.ts"));
  ({ defineInteractableHost } = await import("@behaviors/interactable-host.ts"));
  defineInteractableHost("div");
  defineInteractableHost("section");
});

after(() => {
  teardownJsdom(dom);
});

beforeEach(() => {
  fetchCalls.length = 0;
  document.body.replaceChildren();
});

function installFetch(): void {
  globalThis.fetch = ((...args: Parameters<typeof fetch>): Promise<Response> => {
    const [input, init] = args;
    return new Promise<Response>((resolve, reject) => {
      const signal = init?.signal ?? null;
      fetchCalls.push({
        url: String(input),
        init: init ?? {},
        signal,
        resolve: (response) => resolve(response as unknown as Response),
        reject,
      });
      if (signal !== null) {
        if (signal.aborted) reject(abortError());
        else signal.addEventListener("abort", () => reject(abortError()));
      }
    });
  }) as typeof fetch;
}

function abortError(): Error {
  const error = new Error("aborted");
  error.name = "AbortError";
  return error;
}

function response(ok: boolean, status: number, body: string): FakeResponse {
  return { ok, status, text: () => Promise.resolve(body) };
}

function hostElement(attributes: Record<string, string>): HTMLElement {
  const el = document.createElement("div", { is: "interactable-div" }) as HTMLElement;
  for (const [name, value] of Object.entries(attributes)) el.setAttribute(name, value);
  return el;
}

function revealable(tag: string, id: string): HTMLElement {
  const el = document.createElement(tag, { is: `interactable-${tag}` }) as HTMLElement;
  el.id = id;
  el.setAttribute("implements", "revealable");
  el.hidden = true;
  return el;
}

async function mount(attributes: Record<string, string>): Promise<HTMLElement> {
  const el = hostElement({ implements: "requestable", ...attributes });
  document.body.appendChild(el);
  await flush();
  return el;
}

function interact(el: Element, verb: string): InteractionEvent {
  const event = new InteractionEventClass({
    verb,
    arg: undefined,
    source: el,
    originalEvent: new Event("interaction"),
  });
  el.dispatchEvent(event);
  return event;
}

test("default GET is latest-wins: a second send aborts the first", async () => {
  const el = await mount({ "requestable-url": "/api/search" });
  interact(el, "send");
  interact(el, "send");
  assert.equal(fetchCalls.length, 2);
  assert.equal(fetchCalls[0]!.signal?.aborted, true);
  assert.equal(fetchCalls[1]!.signal?.aborted, false);
  assert.equal(el.getAttribute("data-status"), "loading");
});

test("a non-GET method is first-wins: a second send is refused while one is in flight", async () => {
  const el = await mount({ "requestable-url": "/api/orders", "requestable-method": "post" });
  interact(el, "send");
  interact(el, "send");
  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0]!.init.method, "POST");
});

test("requestable-concurrency=first overrides the GET default", async () => {
  const el = await mount({ "requestable-url": "/api/search", "requestable-concurrency": "first" });
  interact(el, "send");
  interact(el, "send");
  assert.equal(fetchCalls.length, 1);
});

test("requestable-concurrency=latest overrides a POST to supersede", async () => {
  const el = await mount({
    "requestable-url": "/api/orders",
    "requestable-method": "post",
    "requestable-concurrency": "latest",
  });
  interact(el, "send");
  interact(el, "send");
  assert.equal(fetchCalls.length, 2);
  assert.equal(fetchCalls[0]!.signal?.aborted, true);
});

test("requestable-concurrency=all lets both run without aborting", async () => {
  const el = await mount({
    "requestable-url": "/api/search",
    "requestable-concurrency": "all",
  });
  interact(el, "send");
  interact(el, "send");
  assert.equal(fetchCalls.length, 2);
  assert.equal(fetchCalls[0]!.signal?.aborted, false);
});

test("requestable-concurrency=all applies every response, not just the last", async () => {
  const el = await mount({
    "requestable-url": "/api",
    "requestable-concurrency": "all",
  });
  interact(el, "send");
  interact(el, "send");
  assert.equal(fetchCalls.length, 2);
  assert.equal(fetchCalls[0]!.signal?.aborted, false);
  assert.equal(fetchCalls[1]!.signal?.aborted, false);

  fetchCalls[0]!.resolve(response(true, 200, "<b>first</b>"));
  await flush();
  assert.equal(el.innerHTML, "<b>first</b>");
  assert.equal(el.hasAttribute("aria-busy"), true);

  fetchCalls[1]!.resolve(response(true, 200, "<i>second</i>"));
  await flush();
  assert.equal(el.innerHTML, "<i>second</i>");
  assert.equal(el.hasAttribute("aria-busy"), false);
  assert.equal(el.hasAttribute("data-status"), false);
});

test("abort() under requestable-concurrency=all aborts every in-flight request", async () => {
  const el = await mount({
    "requestable-url": "/api",
    "requestable-concurrency": "all",
  });
  interact(el, "send");
  interact(el, "send");
  interact(el, "abort");
  assert.equal(fetchCalls[0]!.signal?.aborted, true);
  assert.equal(fetchCalls[1]!.signal?.aborted, true);
  assert.equal(el.hasAttribute("data-status"), false);
  assert.equal(el.hasAttribute("aria-busy"), false);
  await flush();
});

test("an out-of-set requestable-method is rejected before anything is sent", async () => {
  const el = await mount({ "requestable-url": "/api", "requestable-method": "nonsense" });
  const event = interact(el, "send");
  assert.ok(event.error instanceof Error);
  assert.equal(fetchCalls.length, 0);
  assert.equal(el.hasAttribute("aria-busy"), false);
  assert.equal(el.hasAttribute("data-status"), false);
});

test("an out-of-set requestable-concurrency is rejected before anything is sent", async () => {
  const el = await mount({ "requestable-url": "/api", "requestable-concurrency": "sometimes" });
  const event = interact(el, "send");
  assert.ok(event.error instanceof Error);
  assert.equal(fetchCalls.length, 0);
  assert.equal(el.hasAttribute("aria-busy"), false);
});

test("send sets status=loading and aria-busy synchronously; success clears both and runs after", async () => {
  const el = await mount({
    "requestable-url": "/api",
    "requestable-after": "#receipt.show()",
    "requestable-target": "#receipt",
  });
  const receipt = revealable("section", "receipt");
  document.body.appendChild(receipt);
  await flush();

  interact(el, "send");
  assert.equal(el.getAttribute("data-status"), "loading");
  assert.equal(el.getAttribute("aria-busy"), "true");

  fetchCalls[0]!.resolve(response(true, 200, "<p>hi</p>"));
  await flush();
  assert.equal(el.hasAttribute("data-status"), false);
  assert.equal(el.hasAttribute("aria-busy"), false);
  assert.equal(receipt.innerHTML, "<p>hi</p>");
  assert.equal(receipt.hidden, false);
});

test("a non-ok response sets status=error and runs the error continuation", async () => {
  const el = await mount({ "requestable-url": "/api", "requestable-error": "#alert.show()" });
  const alert = revealable("div", "alert");
  document.body.appendChild(alert);
  await flush();

  interact(el, "send");
  fetchCalls[0]!.resolve(response(false, 500, "boom"));
  await flush();
  assert.equal(el.getAttribute("data-status"), "error");
  assert.equal(el.hasAttribute("aria-busy"), false);
  assert.equal(alert.hidden, false);
});

test("abort() aborts the request and clears status and aria-busy without running a continuation", async () => {
  const el = await mount({ "requestable-url": "/api", "requestable-after": "#receipt.show()" });
  const receipt = revealable("section", "receipt");
  document.body.appendChild(receipt);
  await flush();

  interact(el, "send");
  assert.equal(el.getAttribute("aria-busy"), "true");
  interact(el, "abort");
  assert.equal(fetchCalls[0]!.signal?.aborted, true);
  assert.equal(el.hasAttribute("data-status"), false);
  assert.equal(el.hasAttribute("aria-busy"), false);
  await flush();
  assert.equal(receipt.hidden, true);
});

test("a response that replaces the element skips the continuation", async () => {
  const el = await mount({
    "requestable-url": "/api",
    "requestable-swap": "outerHTML",
    "requestable-after": "#receipt.show()",
  });
  const receipt = revealable("section", "receipt");
  document.body.appendChild(receipt);
  await flush();

  interact(el, "send");
  fetchCalls[0]!.resolve(response(true, 200, "<p id='done'>done</p>"));
  await flush();
  assert.equal(el.isConnected, false);
  assert.equal(document.getElementById("done")?.textContent, "done");
  assert.equal(receipt.hidden, true);
});

test("GET serialises requestable-include into the query string", async () => {
  const el = await mount({ "requestable-url": "/api/search", "requestable-include": "#q" });
  const q = document.createElement("input");
  q.id = "q";
  q.name = "q";
  q.value = "hello world";
  document.body.appendChild(q);

  interact(el, "send");
  assert.equal(fetchCalls[0]!.url, "/api/search?q=hello+world");
});
