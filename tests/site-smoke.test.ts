import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { JSDOM } from "jsdom";
import { setupJsdom, teardownJsdom, flush } from "@tests/jsdom.ts";

const siteDir = new URL("../site/", import.meta.url);
const examplesUrl = new URL("examples.html", siteDir);
const demoUrl = new URL("demo.js", siteDir);
const cdnDir = new URL("../dist/cdn/", import.meta.url);

const KNOWN_BUNDLES = new Set([
  "interactably-core",
  "attributable",
  "auto-grow",
  "condition",
  "copyable",
  "dirtyable",
  "json-template",
  "listable",
  "logger",
  "modifiable",
  "no-propagate",
  "paste-transform",
  "prevent-default",
  "requestable",
  "revealable",
  "storable",
  "validatable",
]);

const VENDOR_REF = /vendor\/([\w.-]+\.js)/g;
const EXTRA_HOST = /defineInteractableHost\("([^"]+)"\)/g;

function vendorRefs(...sources: string[]): string[] {
  const names = new Set<string>();
  for (const source of sources) {
    for (const match of source.matchAll(VENDOR_REF)) {
      const name = match[1];
      if (name !== undefined) names.add(name);
    }
  }
  return [...names];
}

function bareSpecifiers(source: string): string[] {
  const found: string[] = [];
  for (const match of source.matchAll(/(?:from\s+|import\s*\()\s*["']([^"']+)["']/g)) {
    const spec = match[1];
    if (spec !== undefined && !spec.startsWith(".") && !spec.startsWith("/")) found.push(spec);
  }
  return found;
}

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

function click(el: Element): void {
  el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
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

test("site: referenced vendor bundles are built and the demo interacts under jsdom", async (t) => {
  const html = readFileSync(fileURLToPath(examplesUrl), "utf8");
  const demo = readFileSync(fileURLToPath(demoUrl), "utf8");
  const names = vendorRefs(html, demo);

  assert.ok(names.includes("interactably-core.js"), "the site imports the core bundle");
  assert.ok(names.length > 0, "the site references at least one vendor bundle");

  const coreUrl = new URL("interactably-core.js", cdnDir);
  const built = names.every((name) => existsSync(fileURLToPath(new URL(name, cdnDir))));
  if (!existsSync(fileURLToPath(coreUrl)) || !built) {
    t.skip("dist not built; run pnpm build first");
    return;
  }

  for (const name of names) {
    assert.ok(
      existsSync(fileURLToPath(new URL(name, cdnDir))),
      `vendor/${name} is built at dist/cdn/${name}`,
    );
    const base = name.replace(/\.js$/, "");
    assert.ok(KNOWN_BUNDLES.has(base), `vendor/${name} is a known bundle (${base})`);
    const bundle = readFileSync(fileURLToPath(new URL(name, cdnDir)), "utf8");
    const bare = bareSpecifiers(bundle);
    assert.deepEqual(
      bare,
      [],
      `vendor/${name} is browser-loadable: no bare specifiers (${bare.join(", ") || "none"})`,
    );
  }

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

  // Mirror the deployed page: examples.html is parsed with the demo markup
  // already in the document, then demo.js imports the bundles (which register
  // the implementations and define their hosts) and defines the remaining
  // hosts, so each element upgrades in place and any name registered afterwards
  // attaches through the registry-changed re-check.
  const holder = document.createElement("div");
  holder.innerHTML = bodyMarkup(html);
  document.body.appendChild(holder);

  const core = await import(coreUrl.href);
  for (const name of names) {
    if (name === "interactably-core.js") continue;
    await import(new URL(name, cdnDir).href);
  }
  const extraTags = [...demo.matchAll(EXTRA_HOST)].map((match) => match[1]!);
  assert.ok(extraTags.length > 0, "demo.js defines the extra hosts");
  for (const tag of extraTags) core.defineInteractableHost(tag);

  await flush();

  const total = byId("total") as HTMLOutputElement & { didEnsure: boolean };
  assert.equal(total.didEnsure, true, "#total upgraded into the interactable host");
  assert.equal(total.textContent, "$2.50");

  const qty = byId("qty") as HTMLInputElement;
  const preview = byId("preview") as HTMLOutputElement;
  click(byId("inc"));
  assert.equal(qty.value, "2");
  assert.equal(preview.textContent, "2");
  assert.equal(qty.classList.contains("is-dirty"), true, "dirtyable is attached to #qty");

  const escKeydown = new KeyboardEvent("keydown", { key: "Escape", cancelable: true });
  qty.dispatchEvent(escKeydown);
  assert.equal(escKeydown.defaultPrevented, true, "prevent-default derives keydown:escape and cancels the browser's native Escape default");
  assert.equal(qty.value, "1", "Escape runs this.reset()");
  assert.equal(preview.textContent, "1");
  assert.equal(qty.classList.contains("is-dirty"), false, "Escape runs markClean()");

  click(byId("reset"));
  assert.equal(qty.value, "1");
  assert.equal(preview.textContent, "1");
  assert.equal(qty.classList.contains("is-dirty"), false, "reset().markClean() clears the dirty state");

  const list = byId("list") as HTMLUListElement;
  const amount = list.querySelector(".amount") as HTMLInputElement;
  amount.value = "10";
  amount.dispatchEvent(new Event("input", { bubbles: true }));
  assert.equal(total.textContent, "$10.00");
  assert.equal(total.dataset["value"], "10");

  click(byId("add-row"));
  assert.equal(list.children.length, 2);
  assert.equal(total.textContent, "$13.25");
  const cloned = list.querySelectorAll(".amount")[1] as HTMLInputElement;
  cloned.value = "3";
  cloned.dispatchEvent(new Event("input", { bubbles: true }));
  assert.equal(total.textContent, "$13.00");

  click(list.querySelectorAll("li button")[1]!);
  assert.equal(list.children.length, 1);
  assert.equal(total.textContent, "$10.00");

  const panel = byId("panel");
  assert.equal(panel.hidden, true);
  const toggle = byId("panel-toggle");
  click(toggle);
  assert.equal(panel.hidden, false);
  assert.equal(toggle.getAttribute("aria-expanded"), "true");
  click(toggle);
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
  click(tipButton);
  assert.equal(tip.hidden, false, "first click toggles the tip open");
  click(tipButton);
  assert.equal(tip.hidden, false, "once() is spent: the second click is a no-op");

  const swatch = byId("swatch") as HTMLElement;
  click(byId("swatch-dark"));
  assert.equal(swatch.dataset["theme"], "dark", "setAttr({name, value}) writes the attribute");
  click(byId("swatch-border"));
  assert.equal(swatch.hasAttribute("data-bordered"), true, "toggleAttr flips the attribute on");
  click(byId("swatch-border"));
  assert.equal(swatch.hasAttribute("data-bordered"), false, "toggleAttr flips the attribute off");
  click(byId("swatch-clear"));
  assert.equal(swatch.hasAttribute("data-theme"), false, "removeAttr removes the attribute");
  click(byId("swatch-log"));
  assert.ok(consoleLogs.some((line) => line.includes("button clicked")), "logger prints from a phrase");

  const note = byId("note") as HTMLTextAreaElement;
  assert.equal(note.style.overflowY, "hidden", "auto-grow manages the overflow");
  note.value = "typed note";
  note.dispatchEvent(new Event("input", { bubbles: true }));
  assert.equal(note.classList.contains("is-dirty"), true, "dirtyable marks the edited field");
  assert.equal(localStorage.getItem("interactably-demo-note"), "typed note", "storable persists on input");
  note.value = "clean";
  click(byId("note-clean"));
  assert.equal(note.classList.contains("is-dirty"), false, "markClean() re-baselines the dirty state");
  click(byId("note-forget"));
  assert.equal(localStorage.getItem("interactably-demo-note"), null, "storable.clear() drops the saved value");

  const consent = byId("consent");
  assert.equal(consent.hidden, true, "the age gate starts closed");
  const age = byId("age") as HTMLInputElement;
  age.value = "18";
  age.dispatchEvent(new Event("input", { bubbles: true }));
  assert.equal(consent.hidden, false, "condition fires show() when the watched value crosses the threshold");

  const faq = byId("faq") as HTMLDetailsElement;
  assert.equal(faq.open, false);
  click(byId("faq-toggle"));
  assert.equal(faq.open, true, "revealable drives <details>.open");
  assert.equal(byId("faq-toggle").getAttribute("aria-expanded"), "true");

  const signed = byId("signup");
  assert.equal(signed.hasAttribute("data-signed"), false);
  const signup = byId("signup") as HTMLFormElement;
  const signupAlert = byId("signup-alert");
  assert.equal(signupAlert.hidden, true, "the validation-failure alert starts hidden");
  signup.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  assert.equal(signup.hasAttribute("data-signed"), false, "validate() stops the chain when the form is invalid");
  assert.equal(signupAlert.hidden, false, "the || branch shows the alert on an invalid submit");
  const email = signup.querySelector("input") as HTMLInputElement;
  email.value = "not-an-email";
  signup.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  assert.equal(signup.hasAttribute("data-signed"), false, "a value that fails the pattern also stops the chain");
  assert.equal(signupAlert.hidden, false, "the || branch shows the alert for a pattern failure");
  email.value = "you@example.com";
  signup.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  assert.equal(signup.getAttribute("data-signed"), "true", "validate() passes and setAttr() runs");
  assert.equal(signupAlert.hidden, true, "the || branch does not run on a valid submit");

  const members = document.querySelectorAll(".member");
  assert.equal(members.length, 3, "json-template renders one article per item");
  assert.equal(members[0]!.querySelector("h3")!.textContent, "Ada");

  consoleLogs.length = 0;
  click(byId("bubbles-btn"));
  assert.equal(consoleLogs.length, 2, "a plain inner click bubbles to the outer trigger");
  consoleLogs.length = 0;
  click(byId("no-propagate-btn"));
  assert.equal(consoleLogs.length, 1, "no-propagate stops the inner click from reaching the outer trigger");

  const form = byId("order") as HTMLFormElement;
  form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0]!.url, "/api/orders");
  assert.equal(fetchCalls[0]!.init.method, "POST");
  assert.equal(form.getAttribute("data-status"), "loading");

  fetchCalls[0]!.resolve(fakeResponse(true, 200, "<p>placed</p>"));
  await flush();

  const receipt = byId("receipt");
  assert.equal(receipt.innerHTML, "<p>placed</p>");
  assert.equal(receipt.hidden, false);
  assert.equal(byId("alert").hidden, true);
  assert.equal(form.hasAttribute("data-status"), false);
});