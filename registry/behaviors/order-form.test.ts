import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import type { JSDOM } from "jsdom";
import { setupJsdom, teardownJsdom, flush } from "@tests/jsdom.ts";

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
let defineInteractableHost: typeof import("@behaviors/interactable-host.ts").defineInteractableHost;

const fetchCalls: FetchCall[] = [];

const FORM_OPEN = `<form is="interactable-form" id="order" novalidate
      implements="prevent-default validatable requestable"
      requestable-url="/api/orders" requestable-method="post"`;

const HAPPY = `${FORM_OPEN}
      requestable-target="#receipt"
      on-response="#receipt.show(); #alert.show(false)"
      on-request-error="#alert.show()"
      on-submit="this.validate().send()">
  <input id="qty" name="qty" type="number" min="1" required>
  <button>Place order</button>
</form>
<section is="interactable-section" id="receipt" implements="revealable" hidden></section>
<div is="interactable-div" id="alert" implements="revealable" hidden role="alert">Couldn't place the order.</div>`;

const UNOWNED = `${FORM_OPEN}
      requestable-target="#receipt"
      on-response="#receipt.show(); this.reset()"
      on-request-error="#alert.show()"
      on-submit="this.validate().send()">
  <input id="qty" name="qty" type="number" min="1" required>
  <button>Place order</button>
</form>
<section is="interactable-section" id="receipt" implements="revealable" hidden></section>
<div is="interactable-div" id="alert" implements="revealable" hidden role="alert">Couldn't place the order.</div>`;

const OUTER = `${FORM_OPEN}
      requestable-swap="outerHTML"
      on-response="#receipt.show()"
      on-request-error="#alert.show()"
      on-submit="this.validate().send()">
  <input id="qty" name="qty" type="number" min="1" required>
  <button>Place order</button>
</form>
<section is="interactable-section" id="receipt" implements="revealable" hidden></section>
<div is="interactable-div" id="alert" implements="revealable" hidden role="alert">Couldn't place the order.</div>`;

before(async () => {
  dom = setupJsdom();
  installFetch();
  await import("@behaviors/requestable/requestable.ts");
  await import("@behaviors/validatable/validatable.ts");
  await import("@behaviors/revealable/revealable.ts");
  await import("@behaviors/prevent-default/prevent-default.ts");
  ({ defineInteractableHost } = await import("@behaviors/interactable-host.ts"));
  defineInteractableHost("section");
  defineInteractableHost("div");
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
      if (signal !== null && signal.aborted) reject(abortError());
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

function mount(html: string): void {
  const holder = document.createElement("div");
  holder.innerHTML = html;
  document.body.appendChild(holder);
}

function form(): HTMLFormElement {
  return document.getElementById("order") as HTMLFormElement;
}

function receipt(): HTMLElement {
  return document.getElementById("receipt")!;
}

function alertEl(): HTMLElement {
  return document.getElementById("alert")!;
}

function qty(): HTMLInputElement {
  return document.getElementById("qty") as HTMLInputElement;
}

function submit(): void {
  form().dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
}

test("happy path: validate passes, the POST is sent, the response swaps and after runs", async () => {
  mount(HAPPY);
  await flush();
  qty().value = "2";

  submit();
  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0]!.url, "/api/orders");
  assert.equal(fetchCalls[0]!.init.method, "POST");
  assert.ok(fetchCalls[0]!.init.body instanceof FormData);
  assert.equal(form().getAttribute("data-status"), "loading");
  assert.equal(form().getAttribute("aria-busy"), "true");

  fetchCalls[0]!.resolve(response(true, 200, "<p>placed</p>"));
  await flush();
  assert.equal(receipt().innerHTML, "<p>placed</p>");
  assert.equal(receipt().hidden, false);
  assert.equal(alertEl().hidden, true);
  assert.equal(form().hasAttribute("data-status"), false);
  assert.equal(form().hasAttribute("aria-busy"), false);
});

test("validation failure aborts before send", async () => {
  mount(HAPPY);
  await flush();

  submit();
  assert.equal(fetchCalls.length, 0);
  assert.equal(form().hasAttribute("data-status"), false);
  assert.equal(form().hasAttribute("aria-busy"), false);
});

test("double submit under first-wins sends once and runs after once", async () => {
  mount(HAPPY);
  await flush();
  qty().value = "2";

  submit();
  submit();
  assert.equal(fetchCalls.length, 1);

  fetchCalls[0]!.resolve(response(true, 200, "<p>placed</p>"));
  await flush();
  assert.equal(receipt().hidden, false);
  assert.equal(form().hasAttribute("aria-busy"), false);
});

test("server 500 sets status=error and fires on-request-error", async () => {
  mount(HAPPY);
  await flush();
  qty().value = "2";

  submit();
  fetchCalls[0]!.resolve(response(false, 500, "boom"));
  await flush();
  assert.equal(form().getAttribute("data-status"), "error");
  assert.equal(alertEl().hidden, false);
  assert.equal(receipt().hidden, true);
  assert.equal(form().hasAttribute("aria-busy"), false);
});

test("an unowned continuation verb logs and stops; the earlier phrase still runs", async (t) => {
  const spy = t.mock.method(console, "error");
  mount(UNOWNED);
  await flush();
  qty().value = "2";

  submit();
  fetchCalls[0]!.resolve(response(true, 200, "<p>placed</p>"));
  await flush();

  assert.equal(receipt().hidden, false);
  const messages = spy.mock.calls.map((call) => String(call.arguments[0]));
  assert.ok(
    messages.some((message) => message.includes("no implementation on") && message.includes("reset()")),
    `expected an unowned-verb log, got: ${messages.join(" | ")}`,
  );
});

test("a response that replaces the form skips on-response", async () => {
  mount(OUTER);
  await flush();
  qty().value = "2";

  submit();
  fetchCalls[0]!.resolve(response(true, 200, "<p id='done'>done</p>"));
  await flush();

  assert.equal(document.getElementById("order"), null);
  assert.equal(document.getElementById("done")?.textContent, "done");
  assert.equal(receipt().hidden, true);
});
