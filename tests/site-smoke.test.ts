import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { JSDOM } from "jsdom";
import { setupJsdom, teardownJsdom, flush } from "@tests/jsdom.ts";
import {
  FakeIntersectionObserver,
  installFakeIntersectionObserver,
  resetFakeIntersectionObserver,
} from "@tests/intersection-observer.ts";

const siteDir = new URL("../site/", import.meta.url);
const examplesUrl = new URL("examples.html", siteDir);
const docsUrl = new URL("docs.html", siteDir);
const siteBundle = new URL("../dist/site/demo.js", import.meta.url);
const cdnDir = new URL("../dist/cdn/", import.meta.url);

const KNOWN_BUNDLES = new Set([
  "interactably-core",
  "attributable",
  "auto-grow",
  "copyable",
  "dirtyable",
  "focusable",
  "formattable",
  "listable",
  "logger",
  "modifiable",
  "no-propagate",
  "pastable",
  "prevent-default",
  "requestable",
  "revealable",
  "storable",
  "validatable",
]);

function bodyMarkup(html: string): string {
  const match = /<body[^>]*>([\s\S]*)<\/body>/i.exec(html);
  assert.ok(match !== null, "the site HTML has a <body>");
  return match[1] ?? "";
}

function byId(id: string): HTMLElement {
  const element = document.getElementById(id);
  assert.ok(element !== null, `#${id} exists in the mounted demo`);
  return element;
}

async function click(el: Element): Promise<void> {
  el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await flush();
}

interface FakeResponse {
  ok: boolean;
  status: number;
  text(): Promise<string>;
}

interface FetchCall {
  url: string;
  init: RequestInit;
  resolve(response: FakeResponse): void;
}

function fakeResponse(ok: boolean, status: number, body: string): FakeResponse {
  return { ok, status, text: () => Promise.resolve(body) };
}

function setReadyState(state: DocumentReadyState): void {
  Object.defineProperty(document, "readyState", { value: state, configurable: true });
}

test("site: no is= anywhere, the demo ships as one file, and the demo interacts under jsdom", async (t) => {
  const examples = readFileSync(fileURLToPath(examplesUrl), "utf8");

  for (const file of ["docs.html", "examples.html", "index.html", "reference.html"]) {
    const html = readFileSync(fileURLToPath(new URL(file, siteDir)), "utf8");
    assert.equal(html.includes("interactable-"), false, `${file} carries no interactable- mentions`);
  }

  assert.ok(
    existsSync(fileURLToPath(siteBundle)),
    "dist/site/demo.js is missing; run pnpm build first",
  );
  const bundle = readFileSync(fileURLToPath(siteBundle), "utf8");
  assert.equal(
    /^import /m.test(bundle),
    false,
    "dist/site/demo.js is a single file: it imports nothing, so the chain is depth two",
  );

  const dom: JSDOM = setupJsdom();
  t.after(() => teardownJsdom(dom));

  const originalFetch = globalThis.fetch;
  const fetchCalls: FetchCall[] = [];
  globalThis.fetch = ((...args: Parameters<typeof fetch>): Promise<Response> => {
    const [input, init] = args;
    return new Promise<Response>((resolve) => {
      fetchCalls.push({ url: String(input), init: init ?? {}, resolve: (response) => resolve(response as unknown as Response) });
    });
  }) as typeof fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  // Mirror the deployed page-load sequence: the markup is already being parsed
  // (readyState "loading") when demo.js imports the bundles (which register the
  // implementations) and start() runs. start() defers the initial scan to
  // DOMContentLoaded, which is when on-load="this.restore()" replays the stored
  // selection and the matching buttons' on-restore phrases flip the panels.
  localStorage.setItem("pm", "pnpm");
  setReadyState("loading");
  const holder = document.createElement("div");
  holder.innerHTML = bodyMarkup(examples);
  document.body.appendChild(holder);

  await import(siteBundle.href);

  await flush();
  document.dispatchEvent(new Event("DOMContentLoaded"));
  await flush();

  const pmNpm = document.querySelector('button[storable-value="npm"]') as HTMLButtonElement;
  const pmBun = document.querySelector('button[storable-value="bun"]') as HTMLButtonElement;
  assert.equal(byId("install-pnpm").hidden, false, "the stored pnpm buttons' on-load restore opens the pnpm install panel");
  assert.equal(byId("config-pnpm").hidden, false, "the stored pnpm buttons' on-load restore opens the pnpm config panel");
  assert.equal(byId("trouble-pnpm").hidden, false, "the stored pnpm buttons' on-load restore opens the pnpm trouble panel");
  assert.equal(byId("install-npm").hidden, true, "and closes the authored-open npm install panel");
  assert.equal(byId("config-npm").hidden, true, "and closes the authored-open npm config panel");
  assert.equal(byId("trouble-npm").hidden, true, "and closes the authored-open npm trouble panel");
  assert.equal(byId("install-bun").hidden, true, "the bun install panel stays closed");
  await click(pmNpm);
  assert.equal(byId("install-npm").hidden, false, "the npm button opens its three install panels");
  assert.equal(byId("config-npm").hidden, false, "and its three config panels");
  assert.equal(byId("trouble-npm").hidden, false, "and its three trouble panels");
  assert.equal(byId("install-pnpm").hidden, true, "and closes the six pnpm/bun panels");
  assert.equal(byId("config-pnpm").hidden, true, "the pnpm config panel closes");
  assert.equal(byId("trouble-pnpm").hidden, true, "the pnpm trouble panel closes");
  assert.equal(byId("install-bun").hidden, true, "the bun install panel stays closed");
  assert.equal(localStorage.getItem("pm"), "npm", "clicking stores the new selection");
  await click(pmBun);
  assert.equal(byId("install-bun").hidden, false, "the bun button opens all three bun panels");
  assert.equal(byId("config-bun").hidden, false);
  assert.equal(byId("trouble-bun").hidden, false);
  assert.equal(byId("install-pnpm").hidden, true, "the pnpm panels close when bun is picked");
  assert.equal(localStorage.getItem("pm"), "bun", "the bun selection is stored");

  const autoPanel = byId("auto-demo-panel");
  assert.equal(autoPanel.hidden, true, "the plain panel starts closed");
  await click(byId("auto-demo-btn"));
  assert.equal(autoPanel.hidden, false, "a plain on-click trigger toggles the panel open");
  await click(byId("auto-demo-btn"));
  assert.equal(autoPanel.hidden, true, "the same trigger toggles it back");

  const total = byId("total") as HTMLOutputElement;
  assert.equal(total.textContent, "$2.50");

  const qty = byId("qty") as HTMLInputElement;
  const preview = byId("preview") as HTMLOutputElement;
  await click(byId("inc"));
  assert.equal(qty.value, "2");
  assert.equal(preview.textContent, "2");
  assert.equal(qty.hasAttribute("data-dirty"), true, "dirtyable is attached to #qty");

  const escKeydown = new KeyboardEvent("keydown", { key: "Escape", cancelable: true });
  qty.dispatchEvent(escKeydown);
  assert.equal(escKeydown.defaultPrevented, true, "prevent-default derives keydown:escape and cancels the browser's native Escape default");
  assert.equal(qty.value, "1", "Escape runs this.reset()");
  assert.equal(preview.textContent, "1");
  assert.equal(qty.hasAttribute("data-dirty"), false, "reset returns to the baseline, so dirtyable fires clean");

  await click(byId("reset"));
  assert.equal(qty.value, "1");
  assert.equal(preview.textContent, "1");
  assert.equal(qty.hasAttribute("data-dirty"), false, "the Reset button stays clean");

  const list = byId("list") as HTMLUListElement;
  const amount = list.querySelector(".amount") as HTMLInputElement;
  amount.value = "10";
  amount.dispatchEvent(new Event("input", { bubbles: true }));
  assert.equal(total.textContent, "$10.00");
  assert.equal(total.getAttribute("formattable-value"), "10");

  await click(byId("add-row"));
  assert.equal(list.children.length, 2);
  assert.equal(total.textContent, "$13.25");
  const cloned = list.querySelectorAll(".amount")[1] as HTMLInputElement;
  cloned.value = "3";
  cloned.dispatchEvent(new Event("input", { bubbles: true }));
  assert.equal(total.textContent, "$13.00");

  await click(list.querySelectorAll("li button")[1]!);
  assert.equal(list.children.length, 1);
  assert.equal(total.textContent, "$10.00");

  const panel = byId("panel");
  assert.equal(panel.hidden, true);
  const toggle = byId("panel-toggle");
  await click(toggle);
  assert.equal(panel.hidden, false);
  assert.equal(toggle.getAttribute("aria-expanded"), "true");
  await click(toggle);
  assert.equal(panel.hidden, true);

  const consoleLogs: string[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => {
    consoleLogs.push(args.map(String).join(" "));
  };
  t.after(() => {
    console.log = originalLog;
  });

  const mirror = byId("mirror") as HTMLOutputElement;
  const typer = byId("typer") as HTMLInputElement;
  typer.value = "hello";
  typer.dispatchEvent(new Event("input", { bubbles: true }));
  assert.equal(mirror.textContent, "…", "on-input is debounced: the mirror lags the keystroke");
  await new Promise((resolve) => setTimeout(resolve, 350));
  assert.equal(mirror.textContent, "hello", "the debounced phrase ran after the quiet period");
  typer.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  assert.equal(typer.value, "", "escape: this.clear() empties the field");
  typer.value = "echo";
  typer.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
  assert.equal(mirror.textContent, "echo", "enter: #mirror.set(this.value) fires without debounce");

  const tip = byId("tip");
  const tipButton = byId("tip-button");
  assert.equal(tip.hidden, true);
  await click(tipButton);
  assert.equal(tip.hidden, false, "first click toggles the tip open");
  await click(tipButton);
  assert.equal(tip.hidden, false, "once() is spent: the second click is a no-op");

  const swatch = byId("swatch") as HTMLElement;
  await click(byId("swatch-dark"));
  assert.equal(swatch.dataset["theme"], "dark", "setAttr({name, value}) writes the attribute");
  await click(byId("swatch-border"));
  assert.equal(swatch.hasAttribute("data-bordered"), true, "toggleAttr flips the attribute on");
  await click(byId("swatch-border"));
  assert.equal(swatch.hasAttribute("data-bordered"), false, "toggleAttr flips the attribute off");
  await click(byId("swatch-clear"));
  assert.equal(swatch.hasAttribute("data-theme"), false, "removeAttr removes the attribute");
  await click(byId("swatch-log"));
  assert.ok(consoleLogs.some((line) => line.includes("button clicked")), "logger prints from a phrase");

  const note = byId("note") as HTMLTextAreaElement;
  assert.equal(note.style.overflowY, "hidden", "auto-grow manages the overflow");
  note.value = "typed note";
  note.dispatchEvent(new Event("input", { bubbles: true }));
  assert.equal(note.hasAttribute("data-dirty"), true, "dirtyable marks the edited field");

  const consent = byId("consent");
  assert.equal(consent.hidden, true, "the age gate starts closed");
  const age = byId("age") as HTMLInputElement;
  age.value = "18";
  age.dispatchEvent(new Event("change", { bubbles: true }));
  await flush();
  assert.equal(consent.hidden, false, "validate() passes the min=18 constraint and show() opens the consent panel");

  const faq = byId("faq") as HTMLDetailsElement;
  assert.equal(faq.open, false);
  await click(byId("faq-toggle"));
  assert.equal(faq.open, true, "revealable drives <details>.open");
  assert.equal(byId("faq-toggle").getAttribute("aria-expanded"), "true");

  const signup = byId("signup") as HTMLFormElement;
  const signupAlert = byId("signup-alert");
  assert.equal(signup.hasAttribute("data-signed"), false);
  assert.equal(signupAlert.hidden, true, "the validation-failure alert starts hidden");
  signup.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  await flush();
  assert.equal(signup.hasAttribute("data-signed"), false, "validate() stops the chain when the form is invalid");
  assert.equal(signupAlert.hidden, false, "the || branch shows the alert on an invalid submit");
  const email = signup.querySelector("input") as HTMLInputElement;
  email.value = "not-an-email";
  signup.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  await flush();
  assert.equal(signup.hasAttribute("data-signed"), false, "a value that fails the pattern also stops the chain");
  assert.equal(signupAlert.hidden, false, "the || branch shows the alert for a pattern failure");
  email.value = "you@example.com";
  signup.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  await flush();
  assert.equal(signup.getAttribute("data-signed"), "true", "validate() passes and setAttr() runs");
  assert.equal(signupAlert.hidden, true, "the || branch does not run on a valid submit");

  consoleLogs.length = 0;
  await click(byId("bubbles-btn"));
  assert.equal(consoleLogs.length, 2, "a plain inner click bubbles to the outer trigger");
  consoleLogs.length = 0;
  await click(byId("no-propagate-btn"));
  assert.equal(consoleLogs.length, 1, "no-propagate stops the inner click from reaching the outer trigger");

  const form = byId("order") as HTMLFormElement;
  form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0]!.url, "/api/orders");
  assert.equal(fetchCalls[0]!.init.method, "POST");
  assert.equal(form.getAttribute("requestable-status"), "loading");

  fetchCalls[0]!.resolve(fakeResponse(true, 200, "<p>placed</p>"));
  await flush();

  const receipt = byId("receipt");
  assert.equal(receipt.innerHTML, "<p>placed</p>");
  assert.equal(receipt.hidden, false);
  assert.equal(byId("alert").hidden, true);
  assert.equal(form.hasAttribute("requestable-status"), false);
});

test("site: docs.html sidebar lights each section's own link", async (t) => {
  const html = readFileSync(fileURLToPath(docsUrl), "utf8");
  const css = readFileSync(fileURLToPath(new URL("styles.css", siteDir)), "utf8");

  assert.equal(/data-current/.test(css), false, "styles.css contains no data-current");
  assert.equal(/this\.hash\(\)/.test(html), false, "docs.html contains no this.hash()");

  const navMatch = /<nav id="toc"[\s\S]*?<\/nav>/.exec(html);
  assert.ok(navMatch !== null, "docs.html has the sidebar nav");
  const navIds = new Set([...navMatch[0].matchAll(/id="(toc-[a-z0-9-]+)"/g)].map((match) => match[1]!));
  const enterTargets = [...html.matchAll(/<section [^>]*on-intersect-enter="[^"]*#(toc-[a-z0-9-]+)\./g)].map((match) => match[1]!);
  const leaveTargets = [...html.matchAll(/<section [^>]*on-intersect-leave="[^"]*#(toc-[a-z0-9-]+)\./g)].map((match) => match[1]!);
  assert.ok(navIds.size > 0, "the sidebar has nav links");
  for (const target of enterTargets) {
    assert.ok(navIds.has(target), `#${target} exists in the nav`);
  }
  assert.equal(new Set(enterTargets).size, navIds.size, "every nav link has an enter trigger");
  assert.deepEqual([...leaveTargets].sort(), [...enterTargets].sort(), "every enter has a matching leave");

  const coreUrl = new URL("interactably-core.js", cdnDir);
  assert.ok(
    existsSync(fileURLToPath(siteBundle)),
    "dist/site/demo.js is missing; run pnpm build first",
  );

  const dom: JSDOM = setupJsdom();
  t.after(() => teardownJsdom(dom));

  const warns: string[] = [];
  const errors: string[] = [];
  const originalWarn = console.warn;
  const originalError = console.error;
  console.warn = (...args: unknown[]) => {
    warns.push(args.map(String).join(" "));
  };
  console.error = (...args: unknown[]) => {
    errors.push(args.map(String).join(" "));
  };
  t.after(() => {
    console.warn = originalWarn;
    console.error = originalError;
  });

  const holder = document.createElement("div");
  holder.innerHTML = bodyMarkup(html);
  document.body.appendChild(holder);

  resetFakeIntersectionObserver();
  installFakeIntersectionObserver();
  t.after(resetFakeIntersectionObserver);

  const core = await import(coreUrl.href);
  const names = [...KNOWN_BUNDLES].filter((name) => name !== "interactably-core");
  for (const name of names) {
    await import(new URL(name, cdnDir).href);
  }
  core.start();
  await flush();

  const toc = byId("toc");
  assert.equal(toc.tagName.toLowerCase(), "nav", "the sidebar nav has id toc");
  assert.equal(toc.hasAttribute("implements"), false, "the nav itself is not an implementation");

  const section = byId("sec-quick-start");
  const link = byId("toc-quick-start");
  const observer = FakeIntersectionObserver.instances.find((instance) => instance.observed.includes(section));
  assert.ok(observer !== undefined, "the quick-start section observes itself");
  observer.trigger([{ target: section, isIntersecting: true, intersectionRatio: 1 }]);
  await flush();
  assert.equal(link.hasAttribute("data-visible"), true, "enter lights the section's link");
  observer.trigger([{ target: section, isIntersecting: false, intersectionRatio: 0 }]);
  await flush();
  assert.equal(link.hasAttribute("data-visible"), false, "leave clears the section's link");

  assert.deepEqual(warns, [], "the docs body loads without console.warn");
  assert.deepEqual(errors, [], "the docs body loads without console.error");
});