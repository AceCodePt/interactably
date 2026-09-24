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
const referenceUrl = new URL("reference.html", siteDir);
const indexUrl = new URL("index.html", siteDir);
const readmeUrl = new URL("../README.md", import.meta.url);
const siteBundle = new URL("../dist/site/demo.js", import.meta.url);
const cdnDir = new URL("../dist/cdn/", import.meta.url);

const examplesDir = new URL("examples/", siteDir);
const EXAMPLE_PAGES = [
  "one-panel",
  "price-calculator",
  "collapsible-help",
  "live-preview",
  "roving-focus",
  "theme-switcher",
  "class-toggle",
  "growing-note",
  "character-counter",
  "age-gate",
  "reveal-strategies",
  "tabs",
  "synced-sections",
  "signup-guard",
  "click-bubbling",
  "order-form",
  "network-quote",
  "copy-snippet",
  "suggest-as-you-type",
  "guarded-submit",
  "remember-theme",
  "remembered-tab",
  "open-focus",
  "character-mask",
  "reveal-secret",
  "paste-transform",
  "dirty-tracking",
  "dynamic-list",
  "number-format",
  "logging",
  "offline-fallback",
];

function examplePagesBody(): string {
  return EXAMPLE_PAGES.map((name) =>
    bodyMarkup(readFileSync(fileURLToPath(new URL(`${name}.html`, examplesDir)), "utf8")),
  ).join("\n");
}

const EXPORT_NAMES: Record<string, string> = {
  "auto-grow": "autoGrow",
  "no-propagate": "noPropagate",
  "prevent-default": "preventDefault",
};

function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .replace(/`/g, "")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

const KNOWN_BUNDLES = new Set([
  "interactably-core",
  "attributable",
  "auto-grow",
  "classable",
  "copyable",
  "dirtyable",
  "focusable",
  "formattable",
  "logger",
  "modifiable",
  "no-propagate",
  "pastable",
  "prevent-default",
  "renderable",
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
  reject(error: unknown): void;
}

function fakeResponse(ok: boolean, status: number, body: string): FakeResponse {
  return { ok, status, text: () => Promise.resolve(body) };
}

function setReadyState(state: DocumentReadyState): void {
  Object.defineProperty(document, "readyState", { value: state, configurable: true });
}

test("site: no is= anywhere, the demo ships as one file, and the demo interacts under jsdom", async (t) => {
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

  const pageWarns: string[] = [];
  const pageErrors: string[] = [];
  const originalWarnBefore = console.warn;
  const originalErrorBefore = console.error;
  console.warn = (...args: unknown[]) => {
    pageWarns.push(args.map(String).join(" "));
  };
  console.error = (...args: unknown[]) => {
    pageErrors.push(args.map(String).join(" "));
  };
  t.after(() => {
    console.warn = originalWarnBefore;
    console.error = originalErrorBefore;
  });

  // jsdom does not implement the dialog API; the revealable dialog strategy
  // drives showModal()/show()/close(), so stub them like the behaviour tests do.
  const dialogProto = HTMLDialogElement.prototype as unknown as Record<
    string,
    ((this: HTMLDialogElement) => void) | undefined
  >;
  const originalShowModal = dialogProto["showModal"];
  const originalShow = dialogProto["show"];
  const originalClose = dialogProto["close"];
  dialogProto["showModal"] = function (this: HTMLDialogElement) {
    this.open = true;
  };
  dialogProto["show"] = function (this: HTMLDialogElement) {
    this.open = true;
  };
  dialogProto["close"] = function (this: HTMLDialogElement) {
    this.open = false;
  };
  t.after(() => {
    dialogProto["showModal"] = originalShowModal;
    dialogProto["show"] = originalShow;
    dialogProto["close"] = originalClose;
  });

  const originalFetch = globalThis.fetch;
  const fetchCalls: FetchCall[] = [];
  globalThis.fetch = ((...args: Parameters<typeof fetch>): Promise<Response> => {
    const [input, init] = args;
    return new Promise<Response>((resolve, reject) => {
      fetchCalls.push({
        url: String(input),
        init: init ?? {},
        resolve: (response) => resolve(response as unknown as Response),
        reject: (error: unknown) => reject(error),
      });
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
  localStorage.setItem("theme", "sepia");
  localStorage.setItem("maintab", "notes");
  setReadyState("loading");
  const holder = document.createElement("div");
  holder.innerHTML = examplePagesBody();
  document.body.appendChild(holder);

  await import(siteBundle.href);

  await flush();
  document.dispatchEvent(new Event("DOMContentLoaded"));
  await flush();

  assert.equal(document.activeElement, byId("mp-tab-notes"), "on-load restore returns focus to the remembered tab");

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

  const escKeydown = new KeyboardEvent("keydown", { key: "Escape", code: "Escape", cancelable: true });
  qty.dispatchEvent(escKeydown);
  assert.equal(escKeydown.defaultPrevented, true, "prevent-default derives keydown:code:escape and cancels the browser's native Escape default");
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
  typer.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape" }));
  assert.equal(typer.value, "", "on-keydown(code:`Escape`) this.clear() empties the field");
  typer.value = "echo";
  typer.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter" }));
  assert.equal(mirror.textContent, "echo", "on-keydown(code:`Enter`) fires without debounce");

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

  // Guarded submit (validatable × requestable): invalid aborts before the network
  const gsForm = byId("gs-form") as HTMLFormElement;
  const gsOk = byId("gs-ok");
  const gsAlert = byId("gs-alert");
  gsForm.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  await flush();
  assert.equal(gsOk.hidden, true, "an invalid guarded submit never reaches the network");
  assert.equal(gsAlert.hidden, false, "validate() aborts the chain and the || branch shows the alert");
  assert.equal(fetchCalls.length, 1, "an invalid submit never calls send()");
  const gsEmail = gsForm.querySelector("input") as HTMLInputElement;
  gsEmail.value = "you@example.com";
  gsForm.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  await flush();
  assert.equal(gsAlert.hidden, true, "the alert closes on a valid submit");
  assert.equal(fetchCalls.length, 2, "a valid submit posts");
  assert.equal(fetchCalls[1]!.url, "/api/signup");
  assert.equal(fetchCalls[1]!.init.method, "POST");
  fetchCalls[1]!.resolve(fakeResponse(true, 200, "<p>signed up</p>"));
  await flush();
  assert.equal(gsOk.hidden, false, "on-response reveals the success panel");

  // Suggestions (requestable × focusable × revealable)
  const city = byId("city") as HTMLInputElement;
  const cityList = byId("city-list");
  city.value = "li";
  city.dispatchEvent(new Event("input", { bubbles: true }));
  assert.equal(fetchCalls.length, 2, "the suggestions query is debounced");
  await new Promise((resolve) => setTimeout(resolve, 280));
  assert.equal(fetchCalls.length, 3, "after the quiet period the fragment is fetched");
  assert.equal(cityList.hidden, true, "the listbox stays hidden until the response lands");
  const options = [
    `<li role="option"><button id="sug-1" implements="focusable prevent-default" on-click="#city.set('Lisbon'); #city-list.show(false)" on-keydown(code:\`ArrowDown\`)="#sug-2.focus()" on-keydown(code:\`ArrowUp\`)="#city.focus()">Lisbon</button></li>`,
    `<li role="option"><button id="sug-2" implements="focusable prevent-default" on-click="#city.set('London'); #city-list.show(false)" on-keydown(code:\`ArrowDown\`)="#city.focus()" on-keydown(code:\`ArrowUp\`)="#sug-1.focus()">London</button></li>`,
  ];
  fetchCalls[2]!.resolve(fakeResponse(true, 200, options.join("")));
  await flush();
  assert.equal(cityList.hidden, false, "on-response reveals the populated listbox");
  assert.equal(byId("sug-1").hasAttribute("implements"), true, "the swapped-in option attaches its implementations");
  city.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", code: "ArrowDown", cancelable: true }));
  await flush();
  assert.equal(document.activeElement, byId("sug-1"), "arrowdown roves focus to the first option");
  await click(byId("sug-1"));
  assert.equal(city.value, "Lisbon", "clicking an option picks the city into the field");
  assert.equal(cityList.hidden, true, "and closes the listbox");

  // Theme (storable × attributable × revealable): on-load restore paints the stored theme
  const stage = byId("stage") as HTMLElement;
  assert.equal(stage.getAttribute("data-theme"), "sepia", "on-load restore paints the stored theme");
  assert.equal(byId("theme-toast").hidden, false, "restore reveals the toast");
  await click(byId("theme-dark"));
  assert.equal(stage.getAttribute("data-theme"), "dark", "the button paints immediately");
  assert.equal(localStorage.getItem("theme"), "dark", "and saves the choice");
  await click(byId("theme-forget"));
  assert.equal(localStorage.getItem("theme"), null, "Forget clears the key");
  assert.equal(stage.getAttribute("data-theme"), "light", "and reverts the card to its authored theme");

  // Remembered tab (storable × revealable × focusable): restore flips and refocuses
  assert.equal(byId("mp-notes").hidden, false, "the stored tab's panel is open on load");
  assert.equal(byId("mp-overview").hidden, true, "and the authored default is closed");
  await click(byId("mp-tab-overview"));
  assert.equal(localStorage.getItem("maintab"), "overview", "the live switch saves the new tab");
  assert.equal(byId("mp-notes").hidden, true, "and closes the remembered panel");

  // Open + focus (revealable × focusable × modifiable)
  const ofDlg = byId("of-dlg") as HTMLDialogElement;
  assert.equal(ofDlg.open, false);
  await click(byId("of-opener"));
  assert.equal(ofDlg.open, true, "the dialog opens through showModal");
  assert.equal(document.activeElement, byId("of-name"), "the chained focus() lands in the field");
  await click(ofDlg.querySelector("button")!);
  assert.equal(ofDlg.open, false, "show(false) closes the dialog");
  assert.equal(document.activeElement, byId("of-opener"), "closing returns focus to the opener");

  // Mask (modifiable × pastable × dirtyable): only digits survive input
  const phone = byId("phone") as HTMLInputElement;
  phone.value = "12a34";
  phone.dispatchEvent(new Event("input", { bubbles: true }));
  assert.equal(phone.value, "1234", "on-input strips non-digits");
  assert.equal(phone.hasAttribute("data-dirty"), true, "dirtyable flags the edited field");
  phone.value = "";
  phone.dispatchEvent(new Event("input", { bubbles: true }));
  assert.equal(phone.hasAttribute("data-dirty"), false, "returning to the default fires clean");

  // Secret reveal (attributable × classable)
  const pw = byId("pw") as HTMLInputElement;
  assert.equal(pw.type, "password");
  await click(byId("pw-show"));
  assert.equal(pw.type, "text", "setAttr swaps the type to reveal");
  assert.equal(byId("pw-show").classList.contains("active"), true, "classable marks the active button");
  await click(byId("pw-hide"));
  assert.equal(pw.type, "password", "and back to masked");

  // Paste transform (pastable)
  const ptSrc = byId("pt-src") as HTMLTextAreaElement;
  const ptClean = byId("pt-clean") as HTMLOutputElement;
  ptSrc.value = "  line one\n\n\tline two   with  spaces  ";
  ptSrc.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertFromPaste" }));
  assert.equal(ptSrc.value, "line one line two with spaces", "on-pasted collapses whitespace to single spaces");
  assert.equal(ptClean.textContent, "line one line two with spaces", "the cleaned preview mirrors the transform");
  ptSrc.value = "kept\nnewline";
  ptSrc.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText" }));
  assert.equal(ptSrc.value, "kept\nnewline", "plain typing leaves newlines alone");

  // Unsaved changes (dirtyable)
  const dtStatus = byId("dt-status") as HTMLOutputElement;
  const dtName = byId("dt-name") as HTMLInputElement;
  assert.equal(dtStatus.getAttribute("data-state"), "clean", "the status starts clean");
  dtName.value = "Sagi";
  dtName.dispatchEvent(new Event("input", { bubbles: true }));
  assert.equal(dtStatus.textContent.includes("Unsaved changes"), true, "typing fires dirty and updates the status");
  assert.equal(dtStatus.getAttribute("data-state"), "dirty", "setAttr marks the status");
  dtName.value = "";
  dtName.dispatchEvent(new Event("input", { bubbles: true }));
  assert.equal(dtStatus.textContent.includes("All saved"), true, "returning to the default fires clean");
  assert.equal(dtStatus.hasAttribute("data-state"), false, "removeAttr clears the mark");

  // A list you can grow and shrink (renderable): render, delete and undo
  const dlList = byId("dl-list") as HTMLUListElement;
  const dlCount = byId("dl-count") as HTMLOutputElement;
  assert.equal(dlList.children.length, 1);
  await click(byId("dl-add"));
  assert.equal(dlList.children.length, 2, "render stamps a template row");
  assert.equal(dlCount.textContent, "2", "count() tracks the rows");
  await click(dlList.querySelectorAll("li button")[0]!);
  assert.equal(dlList.children.length, 1, "delete targets the row by id");
  await click(dlList.querySelector("li button")!);
  assert.equal(dlList.children.length, 0, "the last row can be deleted too; there is no floor");
  assert.equal(dlCount.textContent, "0");
  await click(byId("dl-add"));
  assert.equal(dlList.children.length, 1);
  await click(byId("dl-undo"));
  assert.equal(dlList.children.length, 0, "undo removes the last stamped row");
  assert.equal(dlCount.textContent, "0");

  // Offline fallback (renderable × requestable): render optimistically, then undo on the offline key
  const ofList = byId("of-list") as HTMLUListElement;
  const ofText = byId("of-text") as HTMLInputElement;
  ofText.value = "offline message";
  assert.equal(ofList.children.length, 0);
  const offlineFetch = fetchCalls.length;
  await click(byId("of-send"));
  assert.equal(ofList.children.length, 1, "render stamps the row before the request");
  assert.equal(fetchCalls.length, offlineFetch + 1, "send fires after render in the same chain");
  assert.equal(fetchCalls[offlineFetch]!.url, "/api/messages");
  fetchCalls[offlineFetch]!.reject(new TypeError("network down"));
  await flush();
  assert.equal(ofList.children.length, 0, "request-offline runs undo and restores");

  // Format a number or date (formattable)
  const nfUsd = byId("nf-usd") as HTMLOutputElement;
  assert.equal(nfUsd.textContent, "$0.00", "formattable formats the authored number at attach");
  const nfPrice = byId("nf-price") as HTMLInputElement;
  nfPrice.value = "1234.5";
  nfPrice.dispatchEvent(new Event("input", { bubbles: true }));
  assert.equal(nfUsd.textContent, "$1,234.50", "a write through modifiable goes through the formatter");
  const nfEur = byId("nf-eur") as HTMLOutputElement;
  assert.equal(nfEur.textContent.includes("1.234,50"), true, "the locale option is passed to Intl");
  const nfWhen = byId("nf-when") as HTMLOutputElement;
  assert.equal(nfWhen.textContent.includes("September 22, 2026"), true, "the authored date formats on load");
  const nfDate = byId("nf-date") as HTMLInputElement;
  nfDate.value = "2026-01-05";
  nfDate.dispatchEvent(new Event("input", { bubbles: true }));
  assert.equal(nfWhen.textContent.includes("January 5, 2026"), true, "a date write re-formats");

  // Log from a phrase (logger)
  await click(byId("lg-hello"));
  assert.ok(
    consoleLogs.some((line) => line.includes("hello from a button") && line.includes("lg-hello")),
    "logger prints the message and names the element",
  );
  await click(byId("lg-math"));
  assert.ok(consoleLogs.some((line) => line.includes("5")), "log() accepts a computed number");

  assert.deepEqual(pageWarns, [], "every example renders and interacts without console.warn");
  assert.deepEqual(pageErrors, [], "every example renders and interacts without console.error");
});

test("site: docs.html sidebar lights each section's own link", async (t) => {
  const html = readFileSync(fileURLToPath(docsUrl), "utf8");
  const css = readFileSync(fileURLToPath(new URL("styles.css", siteDir)), "utf8");

  assert.equal(/data-current/.test(css), false, "styles.css contains no data-current");
  assert.equal(/this\.hash\(\)/.test(html), false, "docs.html contains no this.hash()");

  const navMatch = /<nav id="toc"[\s\S]*?<\/nav>/.exec(html);
  assert.ok(navMatch !== null, "docs.html has the sidebar nav");
  const navIds = new Set([...navMatch[0].matchAll(/id="(toc-[a-z0-9-]+)"/g)].map((match) => match[1]!));
  const enterTargets = [...html.matchAll(/<section [^>]*on-intersect\(state:`enter`[^>]*="[^"]*#(toc-[a-z0-9-]+)\./g)].map((match) => match[1]!);
  const leaveTargets = [...html.matchAll(/<section [^>]*on-intersect\(state:`leave`[^>]*="[^"]*#(toc-[a-z0-9-]+)\./g)].map((match) => match[1]!);
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

test("site: every implementation is in all four homes and both API rows", () => {
  const docs = readFileSync(fileURLToPath(docsUrl), "utf8");
  const reference = readFileSync(fileURLToPath(referenceUrl), "utf8");
  const index = readFileSync(fileURLToPath(indexUrl), "utf8");
  const readme = readFileSync(fileURLToPath(readmeUrl), "utf8");

  const names = [...KNOWN_BUNDLES].filter((name) => name !== "interactably-core");

  for (const name of names) {
    assert.ok(
      docs.includes(`<tr><td><code class="inline-code">${name}</code></td>`),
      `docs.html's implementation table has a ${name} row`,
    );
    assert.ok(
      reference.includes(`<h3><code class="inline-code">${name}</code></h3>`),
      `reference.html has a ${name} card`,
    );
    assert.ok(
      index.includes(`<span class="chip-dot"></span>${name}</a>`),
      `index.html has a ${name} chip`,
    );
    assert.match(
      readme,
      new RegExp("^\\| `" + name + "` \\|", "m"),
      `README.md's implementation table has a ${name} row`,
    );
  }

  const docsApi = /<tr><td>Implementations<\/td><td>([\s\S]*?)<\/td><\/tr>/.exec(docs);
  assert.ok(docsApi !== null, "docs.html has an API Implementations row");
  const readmeApi = /^\| Implementations \|([^\n]*)\|/m.exec(readme);
  assert.ok(readmeApi !== null, "README.md has an API Implementations row");

  for (const name of names) {
    const exported = EXPORT_NAMES[name] ?? name;
    assert.ok(
      docsApi![1]!.includes(`>${exported}</code>`),
      `docs.html's API Implementations row lists ${exported}`,
    );
    assert.ok(
      readmeApi![1]!.includes("`" + exported + "`"),
      `README.md's API Implementations row lists ${exported}`,
    );
  }
});

test("site: README anchors resolve to README headings and docs.html ids", () => {
  const readme = readFileSync(fileURLToPath(readmeUrl), "utf8");
  const docs = readFileSync(fileURLToPath(docsUrl), "utf8");

  const headings = new Set(
    [...readme.matchAll(/^#{1,6}\s+(.+?)\s*$/gm)].map((match) => slugifyHeading(match[1]!)),
  );
  const selfAnchors = [...readme.matchAll(/\]\(#([a-z0-9-]+)\)/g)].map((match) => match[1]!);
  for (const anchor of selfAnchors) {
    assert.ok(headings.has(anchor), `README.md's #${anchor} resolves to a heading in README.md`);
  }

  const docAnchors = [...readme.matchAll(/docs\.html#([a-z0-9-]+)/g)].map((match) => match[1]!);
  for (const anchor of docAnchors) {
    assert.ok(
      docs.includes(`id="${anchor}"`),
      `README.md's docs.html#${anchor} resolves to an id in site/docs.html`,
    );
  }
});

test("site: the README stays a hook", () => {
  const readme = readFileSync(fileURLToPath(readmeUrl), "utf8");
  const lines = (readme.match(/\n/g) ?? []).length;
  assert.ok(lines <= 260, `README.md is ${lines} lines; the ceiling is 260`);
});

test("site: examples.html lists every example page, and each page is standalone", () => {
  const index = readFileSync(fileURLToPath(examplesUrl), "utf8");
  const css = readFileSync(fileURLToPath(new URL("styles.css", siteDir)), "utf8");
  assert.ok(index.includes('<ul class="examples-list">'), "examples.html has the list");
  assert.ok(css.includes(".examples-list"), "styles.css styles the list");
  assert.ok(index.includes("interactable-") === false, "the index carries no interactable- mentions");
  for (const name of EXAMPLE_PAGES) {
    const page = readFileSync(fileURLToPath(new URL(`${name}.html`, examplesDir)), "utf8");
    assert.ok(index.includes(`./examples/${name}.html`), `examples.html links to ${name}`);
    assert.equal(page.includes("interactable-"), false, `${name} carries no interactable- mentions`);
    assert.ok(page.includes('href="../examples.html"'), `${name} links back to the list`);
    assert.ok(page.includes('href="../styles.css"'), `${name} loads the stylesheet`);
    assert.ok(page.includes('src="../demo.js"'), `${name} loads the site bundle`);
    assert.ok(/<title>[^<]+<\/title>/.test(page), `${name} has a title`);
    assert.ok(page.includes("<main"), `${name} has a main`);
    assert.ok(page.includes("</main>"), `${name} closes its main`);
  }
});
