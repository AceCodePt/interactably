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
const demoUrl = new URL("demo.js", siteDir);
const cdnDir = new URL("../dist/cdn/", import.meta.url);

const KNOWN_BUNDLES = new Set([
  "interactably-core",
  "auto-loader",
  "attributable",
  "auto-grow",
  "copyable",
  "dirtyable",
  "formattable",
  "hashable",
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
  const pattern = /\b(?:import|export)\b[^\n]*?\bfrom\s*["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']/g;
  for (const match of source.matchAll(pattern)) {
    const spec = match[1] ?? match[2];
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

  // Mirror the deployed page-load sequence: the markup is already being parsed
  // (readyState "loading") when demo.js imports the bundles (which register the
  // implementations and define their hosts), the auto-loader runs, and
  // DOMContentLoaded fires - which is when storable restores the stored radios.
  localStorage.setItem("interactable:pm", JSON.stringify(["pnpm"]));
  Object.defineProperty(document, "readyState", { value: "loading", configurable: true });
  const holder = document.createElement("div");
  holder.innerHTML = bodyMarkup(html);
  document.body.appendChild(holder);

  const core = await import(coreUrl.href);
  let autoLoader: { installAutoLoader(): () => void } | undefined;
  for (const name of names) {
    if (name === "interactably-core.js") continue;
    const bundle = await import(new URL(name, cdnDir).href);
    if (name === "auto-loader.js") autoLoader = bundle as typeof autoLoader;
  }
  const extraTags = [...demo.matchAll(EXTRA_HOST)].map((match) => match[1]!);
  assert.ok(extraTags.length > 0, "demo.js defines the extra hosts");
  for (const tag of extraTags) core.defineInteractableHost(tag);

  assert.ok(autoLoader !== undefined, "demo.js installs the auto-loader");
  autoLoader.installAutoLoader();

  await flush();
  document.dispatchEvent(new Event("DOMContentLoaded"));
  await flush();

  const pmNpm = document.querySelector('input[name="pm"][value="npm"]') as HTMLInputElement;
  const pmPnpm = document.querySelector('input[name="pm"][value="pnpm"]') as HTMLInputElement;
  const pmBun = document.querySelector('input[name="pm"][value="bun"]') as HTMLInputElement;
  assert.equal(pmPnpm.checked, true, "the stored radio is restored checked");
  assert.equal(pmNpm.checked, false, "the authored npm radio is overridden by the stored selection");
  assert.equal(pmBun.checked, false);
  assert.equal(byId("install-pnpm").hidden, false, "the stored radio's install panel is open");
  assert.equal(byId("config-pnpm").hidden, false, "the stored radio's config panel is open");
  assert.equal(byId("trouble-pnpm").hidden, false, "the stored radio's trouble panel is open");
  assert.equal(byId("install-npm").hidden, true, "the sibling's install panel is closed");
  assert.equal(byId("config-npm").hidden, true, "the sibling's config panel is closed");
  assert.equal(byId("trouble-npm").hidden, true, "the sibling's trouble panel is closed");
  assert.equal(byId("install-bun").hidden, true, "the unselected radio's install panel stays closed");
  click(pmNpm);
  assert.equal(pmNpm.checked, true, "clicking another radio selects it");
  assert.equal(byId("install-npm").hidden, false, "the clicked radio's install panel opens");
  assert.equal(byId("config-npm").hidden, false, "the clicked radio's config panel opens");
  assert.equal(byId("trouble-npm").hidden, false, "the clicked radio's trouble panel opens");
  assert.equal(byId("install-pnpm").hidden, true, "the previous radio's install panel closes");
  assert.equal(byId("config-pnpm").hidden, true, "the previous radio's config panel closes");
  assert.equal(byId("trouble-pnpm").hidden, true, "the previous radio's trouble panel closes");
  assert.equal(byId("install-bun").hidden, true, "the unselected radio's install panel stays closed");
  assert.equal(localStorage.getItem("interactable:pm"), JSON.stringify(["npm"]), "clicking stores the new selection");
  click(pmBun);
  assert.equal(byId("install-bun").hidden, false, "the bun radio opens all three bun panels");
  assert.equal(byId("config-bun").hidden, false);
  assert.equal(byId("trouble-bun").hidden, false);
  assert.equal(byId("install-pnpm").hidden, true, "the pnpm panels close when bun is picked");
  assert.equal(localStorage.getItem("interactable:pm"), JSON.stringify(["bun"]), "the bun selection is stored");

  const autoPanel = byId("auto-demo-panel");
  assert.equal(autoPanel.getAttribute("is"), "interactable-section", "the auto-loader adds is= to the no-is= demo");
  assert.equal(autoPanel.hidden, true, "the no-is= panel starts closed");
  click(byId("auto-demo-btn"));
  assert.equal(autoPanel.hidden, false, "the no-is= demo runs through the auto-loader");
  click(byId("auto-demo-btn"));
  assert.equal(autoPanel.hidden, true, "the no-is= demo toggles back");

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
  assert.equal(total.getAttribute("formattable-value"), "10");

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
  note.dispatchEvent(new Event("change", { bubbles: true }));
  assert.equal(localStorage.getItem("interactable:interactably-demo-note"), "typed note", "storable saves via the this.save() phrase");
  note.value = "clean";
  click(byId("note-clean"));
  assert.equal(note.classList.contains("is-dirty"), false, "markClean() re-baselines the dirty state");

  const consent = byId("consent");
  assert.equal(consent.hidden, true, "the age gate starts closed");
  const age = byId("age") as HTMLInputElement;
  age.value = "18";
  age.dispatchEvent(new Event("change", { bubbles: true }));
  assert.equal(consent.hidden, false, "validate() passes the min=18 constraint and show() opens the consent panel");

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

  const tabAuto = byId("demo-auto").parentElement!.querySelector(".tabbar button[aria-controls='demo-auto']")!;
  const tabExplicit = document.querySelector(".tabbar button[aria-controls='demo-is']")!;
  click(tabExplicit);
  assert.equal(tabAuto.getAttribute("aria-expanded"), "false", "hiding the sibling panel collapses its controller");
  assert.equal(tabExplicit.getAttribute("aria-expanded"), "true");
  click(tabAuto);
  assert.equal(tabAuto.getAttribute("aria-expanded"), "true");
  assert.equal(tabExplicit.getAttribute("aria-expanded"), "false", "exactly one tab reads expanded");
});

test("site: docs.html sidebar is a push current-section marker", async (t) => {
  const html = readFileSync(fileURLToPath(docsUrl), "utf8");
  const demo = readFileSync(fileURLToPath(demoUrl), "utf8");
  const coreUrl = new URL("interactably-core.js", cdnDir);
  if (!existsSync(fileURLToPath(coreUrl))) {
    t.skip("dist not built; run pnpm build first");
    return;
  }

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
  const names = vendorRefs(html, demo);
  let autoLoader: { installAutoLoader(): () => void } | undefined;
  for (const name of names) {
    if (name === "interactably-core.js") continue;
    const bundle = await import(new URL(name, cdnDir).href);
    if (name === "auto-loader.js") autoLoader = bundle as typeof autoLoader;
  }
  const extraTags = [...demo.matchAll(EXTRA_HOST)].map((match) => match[1]!);
  assert.ok(extraTags.includes("h2") && extraTags.includes("h3"), "demo.js defines the h2 and h3 hosts");
  for (const tag of extraTags) core.defineInteractableHost(tag);

  assert.ok(autoLoader !== undefined, "demo.js installs the auto-loader");
  autoLoader.installAutoLoader();
  await flush();
  document.dispatchEvent(new Event("DOMContentLoaded"));
  await flush();

  const toc = byId("toc");
  assert.equal(toc.tagName.toLowerCase(), "nav", "the sidebar nav has id toc");
  assert.equal(toc.getAttribute("implements"), "attributable", "the sidebar nav implements attributable");

  const heading = document.querySelector<HTMLElement>("h2#quick-start");
  assert.ok(heading !== null, "the docs body has an h2#quick-start heading");
  const phrase = heading.getAttribute("on-intersect-half") ?? "";
  assert.ok(phrase.includes("#toc"), "a heading's on-intersect-half names #toc");

  const observer = FakeIntersectionObserver.instances.find(
    (instance) => instance.rootMargin === "0px 0px -50% 0px" && instance.observed.includes(heading),
  );
  assert.ok(observer !== undefined, "a heading observes the middle-line margin");
  observer.trigger([{ target: heading }]);
  await flush();

  assert.equal(
    toc.getAttribute("data-current"),
    "quick-start",
    "crossing the heading sets #toc data-current to the heading's id",
  );

  assert.deepEqual(warns, [], "the docs body loads without console.warn");
  assert.deepEqual(errors, [], "the docs body loads without console.error");
});