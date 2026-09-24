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
import {
  FakeResizeObserver,
  installFakeResizeObserver,
  resetFakeResizeObserver,
} from "@tests/resize-observer.ts";

const siteDir = new URL("../site/", import.meta.url);
const examplesUrl = new URL("examples.html", siteDir);
const docsUrl = new URL("docs.html", siteDir);
const referenceUrl = new URL("reference.html", siteDir);
const indexUrl = new URL("index.html", siteDir);
const readmeUrl = new URL("../README.md", import.meta.url);
const siteBundle = new URL("../dist/site/demo.js", import.meta.url);
const cdnDir = new URL("../dist/cdn/", import.meta.url);
const todoFragment = readFileSync(fileURLToPath(new URL("fragments/todos.html", siteDir)), "utf8");

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
  "scroll-spy",
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
  "todo-list",
  "shop-cart",
  "multi-step-form",
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
  localStorage.setItem("todos", todoFragment);
  setReadyState("loading");
  const holder = document.createElement("div");
  holder.innerHTML = examplePagesBody();
  document.body.appendChild(holder);

  await import(siteBundle.href);

  await flush();
  document.dispatchEvent(new Event("DOMContentLoaded"));
  await flush();

  assert.equal(document.activeElement, byId("mp-tab-notes"), "on-load restore returns focus to the remembered tab");

  const todoList = byId("todo-list") as HTMLUListElement;
  assert.equal(
    fetchCalls.some((call) => call.url === "../fragments/todos.html"),
    false,
    "restore owns load; the sample GET waits for the explicit button",
  );
  const restoredTodoRows = [...todoList.querySelectorAll("li")];
  assert.equal(restoredTodoRows.length, 3, "the stored todo markup restores on load");
  for (const row of restoredTodoRows) {
    await click(row.querySelector("button")!);
  }
  assert.equal(todoList.children.length, 0, "every restored delete phrase removes its row");
  localStorage.removeItem("todos");

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

  const todoLoadStart = fetchCalls.length;
  await click(byId("todo-load"));
  assert.equal(fetchCalls.length, todoLoadStart + 1, "the sample button starts the GET");
  const todoFetch = fetchCalls[todoLoadStart]!;
  assert.equal(todoFetch.url, "../fragments/todos.html");
  todoFetch.resolve(fakeResponse(true, 200, todoFragment));
  await flush();
  assert.equal(todoList.children.length, 3, "the GET response renders the seeded rows");
  assert.equal(localStorage.getItem("todos"), todoList.innerHTML, "rendered snapshots the list into storage");

  const todoInput = byId("todo-input") as HTMLInputElement;
  todoInput.value = "Write the handoff";
  await click(byId("todo-add"));
  assert.equal(todoList.children.length, 4, "the add phrase stamps a row");
  assert.equal(todoInput.value, "", "the add phrase clears the input after reading it");
  const addedTodo = todoList.lastElementChild as HTMLElement;
  assert.match(addedTodo.id, /^todo-row-\d+$/);
  assert.equal(addedTodo.querySelector(".todo-title")?.textContent, "Write the handoff");
  assert.equal(localStorage.getItem("todos"), todoList.innerHTML, "adding snapshots the stamped row");

  await click(todoList.querySelector("li button")!);
  assert.equal(todoList.children.length, 3, "delete removes a row by its stamped id");
  assert.equal(localStorage.getItem("todos"), todoList.innerHTML, "deleting snapshots the list");

  todoInput.value = "Undo this row";
  await click(byId("todo-add"));
  const undoTodo = todoList.lastElementChild as HTMLElement;
  const undoTodoId = undoTodo.id;
  await click(byId("todo-undo"));
  assert.equal(todoList.children.length, 3, "undo removes the last stamped row");
  assert.equal(document.getElementById(undoTodoId), null);
  assert.equal(localStorage.getItem("todos"), todoList.innerHTML, "undo explicitly snapshots the list");

  const todoStore = byId("todo-store");
  const storedTodo = todoList.innerHTML;
  todoList.replaceChildren();
  localStorage.setItem("todos", storedTodo);
  todoStore.remove();
  await flush();
  document.body.append(todoStore);
  await flush();
  assert.equal(todoList.children.length, 3, "a reload restores the saved DOM");
  await click(todoList.querySelector("li button")!);
  assert.equal(todoList.children.length, 2, "a restored row still has a live delete phrase");

  const cart = byId("cart") as HTMLUListElement;
  const cartTotal = byId("cart-total") as HTMLOutputElement;
  const cartStore = byId("cart-store");
  assert.equal(cart.children.length, 0, "the anonymous cart starts empty");
  assert.equal(cartTotal.textContent, "$0.00", "the empty cart starts at zero");

  await click(byId("shop-add-mug"));
  assert.equal(cart.children.length, 1, "a product button appends one line");
  assert.equal(cart.querySelector(".cart-name")?.textContent, "Enamel mug");
  assert.equal(cart.querySelector(".cart-price")?.textContent, "12");
  assert.equal(cartTotal.textContent, "$12.00", "the rendered event recomputes the total");
  assert.equal(localStorage.getItem("cart"), cart.innerHTML, "the rendered event mirrors the cart markup");

  await new Promise((resolve) => setTimeout(resolve, 2));
  await click(byId("shop-add-mug"));
  assert.equal(cart.children.length, 2, "the same product makes a second line");
  assert.equal(cartTotal.textContent, "$24.00", "duplicate lines contribute twice");

  await click(byId("shop-add-notebook"));
  assert.equal(cart.children.length, 3, "a different product appends its own line");
  assert.equal(cartTotal.textContent, "$32.00", "the running total includes every line");

  const savedCart = cart.innerHTML;
  cart.replaceChildren();
  cartStore.remove();
  await flush();
  document.body.append(cartStore);
  await flush();
  assert.equal(cart.children.length, 3, "a reload restores the saved cart markup");
  assert.equal(cartTotal.textContent, "$32.00", "the rendered restore event recomputes the restored total");
  assert.equal(cart.innerHTML, savedCart, "restoring does not require a page-load total phrase");

  const restoredRemove = cart.querySelector("li button");
  assert.ok(restoredRemove !== null);
  await click(restoredRemove);
  assert.equal(cart.children.length, 2, "a restored remove button remains live");
  assert.equal(cartTotal.textContent, "$20.00", "removing a restored line recomputes the total");

  await click(byId("cart-empty"));
  assert.equal(cart.children.length, 0, "empty cart removes every line");
  assert.equal(cartTotal.textContent, "$0.00", "empty cart zeroes the total");
  assert.equal(localStorage.getItem("cart"), "", "empty cart saves the empty DOM snapshot");

  cartStore.remove();
  await flush();
  document.body.append(cartStore);
  await flush();
  assert.equal(cart.children.length, 0, "an empty snapshot survives reload as empty");
  assert.equal(cartTotal.textContent, "$0.00", "an empty snapshot restores the zero total");

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

test("site: each POST example reacts to a status failure and a network failure", async (t) => {
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

  const holder = document.createElement("div");
  holder.innerHTML = ["offline-fallback", "guarded-submit", "order-form"]
    .map((name) => bodyMarkup(readFileSync(fileURLToPath(new URL(`${name}.html`, examplesDir)), "utf8")))
    .join("\n");
  document.body.appendChild(holder);
  await import(`${siteBundle.href}?post-failures-test`);
  await flush();
  document.dispatchEvent(new Event("DOMContentLoaded"));
  await flush();

  // Offline fallback: a non-ok status is a failure, not a silent success
  const ofList = byId("of-list") as HTMLUListElement;
  await click(byId("of-send"));
  assert.equal(ofList.children.length, 1, "the optimistic row renders before the response");
  const ofStatusFetch = fetchCalls.length - 1;
  assert.equal(fetchCalls[ofStatusFetch]!.url, "/api/messages");
  fetchCalls[ofStatusFetch]!.resolve(fakeResponse(false, 405, ""));
  await flush();
  assert.equal(ofList.children.length, 0, "request-error rolls the row back on a non-ok status");
  await click(byId("of-send"));
  assert.equal(ofList.children.length, 1, "a second send renders the row again");
  const ofNetworkFetch = fetchCalls.length - 1;
  fetchCalls[ofNetworkFetch]!.reject(new TypeError("network down"));
  await flush();
  assert.equal(ofList.children.length, 0, "request-offline rolls the row back on a network failure");

  // Guarded submit: a server failure gets its own alert, not the validation one
  const gsForm = byId("gs-form") as HTMLFormElement;
  const gsEmail = gsForm.querySelector("input") as HTMLInputElement;
  const gsAlert = byId("gs-alert");
  const gsServerAlert = byId("gs-server-alert");
  gsEmail.value = "you@example.com";
  gsForm.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  await flush();
  const gsStatusFetch = fetchCalls.length - 1;
  assert.equal(fetchCalls[gsStatusFetch]!.url, "/api/signup");
  fetchCalls[gsStatusFetch]!.resolve(fakeResponse(false, 405, ""));
  await flush();
  assert.equal(gsServerAlert.hidden, false, "request-error shows the server-failure alert");
  assert.equal(gsAlert.hidden, true, "a valid submit never shows the validation alert");
  gsForm.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  await flush();
  const gsNetworkFetch = fetchCalls.length - 1;
  fetchCalls[gsNetworkFetch]!.reject(new TypeError("network down"));
  await flush();
  assert.equal(gsServerAlert.hidden, false, "request-offline shows the server-failure alert");
  assert.equal(gsAlert.hidden, true, "and still not the validation alert");

  // Order form: the same honest alert on every failure
  const orderForm = byId("order") as HTMLFormElement;
  const orderAlert = byId("alert");
  orderForm.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  await flush();
  const orderStatusFetch = fetchCalls.length - 1;
  assert.equal(fetchCalls[orderStatusFetch]!.url, "/api/orders");
  fetchCalls[orderStatusFetch]!.resolve(fakeResponse(false, 405, ""));
  await flush();
  assert.equal(orderAlert.hidden, false, "request-error shows the order alert");
  orderForm.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  await flush();
  const orderNetworkFetch = fetchCalls.length - 1;
  fetchCalls[orderNetworkFetch]!.reject(new TypeError("network down"));
  await flush();
  assert.equal(orderAlert.hidden, false, "request-offline shows the order alert");

  assert.deepEqual(warns, [], "the POST examples load without console.warn");
  assert.deepEqual(errors, [], "the POST examples load without console.error");
});

test("site: the multi-step form gates, explains and closes every later step", async (t) => {
  const html = readFileSync(fileURLToPath(new URL("examples/multi-step-form.html", siteDir)), "utf8");
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
  await import(`${siteBundle.href}?multi-step-form-test`);
  await flush();
  document.dispatchEvent(new Event("DOMContentLoaded"));
  await flush();

  const byStepId = (id: string): HTMLElement => byId(`step-${id}`);
  const step1Choice = byStepId("1-choice") as HTMLInputElement;
  const step2Choice = byStepId("2-choice") as HTMLInputElement;
  const step3Choice = byStepId("3-choice") as HTMLInputElement;
  const step1Panel = byStepId("1-panel");
  const step2Panel = byStepId("2-panel");
  const step3Panel = byStepId("3-panel");
  const step1Name = byStepId("1-name") as HTMLInputElement;
  const step1Email = byStepId("1-email") as HTMLInputElement;
  const step1Message = byStepId("1-name-message");
  const step2Project = byStepId("2-project") as HTMLInputElement;
  const step2Role = byStepId("2-role") as HTMLSelectElement;
  const step3Note = byStepId("3-note") as HTMLTextAreaElement;
  const step3Consent = byStepId("3-consent") as HTMLInputElement;
  const step2Gate = byStepId("2-gate");
  const step3Gate = byStepId("3-gate");
  const step3Status = byStepId("3-status");
  const step1Form = byStepId("1-form") as HTMLFormElement;
  const step2Form = byStepId("2-form") as HTMLFormElement;
  const step3Form = byStepId("3-form") as HTMLFormElement;
  const progress = byStepId("progress");
  const confirmation = byStepId("confirmation");

  const input = (element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string): void => {
    element.value = value;
    element.dispatchEvent(new Event("input", { bubbles: true }));
  };
  const change = (element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string): void => {
    element.value = value;
    element.dispatchEvent(new Event("change", { bubbles: true }));
  };

  assert.equal(document.querySelectorAll("input[type=radio][name=step]").length, 3, "the stepper is a three-radio group");
  assert.equal(document.querySelectorAll('form[implements~="validatable"]').length, 3, "each step is a validatable form");
  assert.equal(document.querySelector("fieldset[implements~=validatable]"), null, "the stepper fieldset is not a validity gate");
  assert.equal(document.querySelectorAll("[on-valid], [on-invalid]").length, 1, "the aggressive pair is used on one live indicator");
  assert.equal(step2Choice.disabled, true, "step 2 starts natively disabled");
  assert.equal(step3Choice.disabled, true, "step 3 starts natively disabled");
  assert.equal(step2Choice.getAttribute("aria-disabled"), "true", "step 2 announces its disabled state");
  assert.equal(step3Choice.getAttribute("aria-disabled"), "true", "step 3 announces its disabled state");
  assert.equal(step2Choice.getAttribute("aria-describedby"), "step-2-gate", "step 2 points at its explanation");
  assert.equal(step3Choice.getAttribute("aria-describedby"), "step-3-gate", "step 3 points at its explanation");
  assert.equal(step1Panel.hidden, false, "step 1 is the initially visible panel");
  assert.equal(step2Panel.hidden, true, "later panels start closed");
  assert.equal(step2Gate.hidden, false, "the step 2 explanation is visible while locked");
  assert.equal(step3Gate.hidden, false, "the step 3 explanation is visible while locked");
  assert.equal(step1Message.hidden, true, "an untouched invalid field stays quiet");
  assert.equal(progress.textContent, "Step 1 of 3 incomplete");

  input(step1Name, "Ada");
  input(step1Email, "ada@example.com");
  change(step1Name, "Ada");
  change(step1Email, "ada@example.com");
  await flush();
  assert.equal(step1Form.checkValidity(), true, "the first form becomes valid");
  assert.equal(step2Choice.disabled, false, "a valid first form enables step 2");
  assert.equal(step2Choice.hasAttribute("aria-disabled"), false, "the enabled radio drops aria-disabled");
  assert.equal(step2Choice.hasAttribute("aria-describedby"), false, "the enabled radio drops its explanation reference");
  assert.equal(step2Gate.hidden, true, "the step 2 explanation is removed after completion");
  assert.equal(progress.textContent, "Step 1 of 3 complete", "the aggressive indicator reports the valid evaluation");

  step2Choice.click();
  await flush();
  assert.equal(step2Choice.checked, true, "the native radio selects step 2");
  assert.equal(step1Panel.hidden, true, "selecting step 2 closes step 1");
  assert.equal(step2Panel.hidden, false, "selecting step 2 reveals its panel");

  input(step2Project, "A small useful thing");
  change(step2Project, "A small useful thing");
  input(step2Role, "developer");
  change(step2Role, "developer");
  await flush();
  assert.equal(step2Form.checkValidity(), true, "the second form becomes valid");
  assert.equal(step3Choice.disabled, false, "a valid second form enables step 3");
  assert.equal(step3Gate.hidden, true, "the step 3 explanation is removed after step 2");

  step3Choice.click();
  await flush();
  assert.equal(step3Panel.hidden, false, "selecting step 3 reveals the final form");
  input(step3Note, "A short note for the team");
  change(step3Note, "A short note for the team");
  step3Consent.click();
  await flush();
  assert.equal(step3Form.checkValidity(), true, "the final form becomes valid");
  assert.equal(step3Status.hidden, true, "a valid final form hides its completion status");
  step3Form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  await flush();
  assert.equal(confirmation.hidden, false, "the final submit reveals the local confirmation");

  step1Choice.click();
  await flush();
  input(step1Name, "");
  change(step1Name, "");
  await flush();
  assert.equal(step1Message.hidden, false, "clearing a previously valid field reveals its message");
  assert.equal(step1Choice.checked, true, "breaking step 1 returns the reader to it");
  assert.equal(step1Panel.hidden, false, "the broken step is visible");
  assert.equal(step2Panel.hidden, true, "the later panel is closed");
  assert.equal(step3Panel.hidden, true, "the final panel is closed");
  assert.equal(step2Choice.disabled, true, "breaking step 1 transitively disables step 2");
  assert.equal(step3Choice.disabled, true, "breaking step 1 transitively disables step 3");
  assert.equal(step2Choice.getAttribute("aria-describedby"), "step-2-gate", "the step 2 explanation is restored");
  assert.equal(step3Choice.getAttribute("aria-describedby"), "step-3-gate", "the step 3 explanation is restored");
  assert.equal(step2Gate.hidden, false, "the step 2 explanation is visible again");
  assert.equal(step3Gate.hidden, false, "the step 3 explanation is visible again");

  input(step1Name, "Ada");
  await flush();
  assert.equal(step1Message.hidden, true, "fixing the field hides its message");

  assert.deepEqual(warns, [], "the multi-step form loads without console.warn");
  assert.deepEqual(errors, [], "the multi-step form loads without console.error");
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

test("site: the scroll-spy example lights, resizes and records a full view", async (t) => {
  const html = readFileSync(fileURLToPath(new URL("examples/scroll-spy.html", siteDir)), "utf8");
  const dom: JSDOM = setupJsdom();
  t.after(() => teardownJsdom(dom));

  resetFakeIntersectionObserver();
  installFakeIntersectionObserver();
  resetFakeResizeObserver();
  installFakeResizeObserver();
  t.after(() => {
    resetFakeIntersectionObserver();
    resetFakeResizeObserver();
    Reflect.deleteProperty(globalThis, "IntersectionObserver");
    Reflect.deleteProperty(globalThis, "ResizeObserver");
  });

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
  await import(`${siteBundle.href}?scroll-spy-test`);
  await flush();
  document.dispatchEvent(new Event("DOMContentLoaded"));
  await flush();

  const first = byId("spy-section-observe");
  const firstLink = byId("spy-toc-observe");
  const read = byId("spy-section-read");
  const readLink = byId("spy-toc-read");
  const header = byId("spy-header");
  assert.equal(document.querySelector("[on-load]"), null, "the example has no page-load phrase");
  assert.equal(
    [...document.querySelectorAll("*")].filter((element) =>
      element.getAttributeNames().some((name) => name.includes("full:`true`")),
    ).length,
    1,
    "the live demo has one full:true matcher",
  );
  assert.equal(firstLink.hasAttribute("data-visible"), false, "the first link waits for the observer report");

  const firstObserver = FakeIntersectionObserver.instances.find((instance) => instance.observed.includes(first));
  assert.ok(firstObserver !== undefined, "the first section observes itself");
  const viewport = { top: 0, right: 800, bottom: 600, left: 0, width: 800, height: 600 };
  const firstBox = { top: 100, right: 800, bottom: 200, left: 0, width: 800, height: 100 };
  firstObserver.trigger([
    {
      target: first,
      isIntersecting: true,
      intersectionRatio: 1,
      boundingClientRect: firstBox,
      intersectionRect: firstBox,
      rootBounds: viewport,
    },
  ]);
  await flush();
  assert.equal(firstLink.hasAttribute("data-visible"), true, "the initial enter report lights the first link");
  firstObserver.trigger([
    {
      target: first,
      isIntersecting: false,
      intersectionRatio: 0,
      boundingClientRect: { top: 700, right: 800, bottom: 800, left: 0, width: 800, height: 100 },
      intersectionRect: { top: 700, right: 800, bottom: 700, left: 0, width: 0, height: 0 },
      rootBounds: viewport,
    },
  ]);
  await flush();
  assert.equal(firstLink.hasAttribute("data-visible"), false, "leave unlights the first link");

  const resize = FakeResizeObserver.instances.find((instance) => instance.observed.includes(header));
  assert.ok(resize !== undefined, "the referenced header is measured through ResizeObserver");
  resize.trigger([{ target: header, borderBoxSize: [{ blockSize: 72, inlineSize: 800 }] }]);
  await flush();
  const rebuilt = FakeIntersectionObserver.instances.filter((instance) => instance.observed.includes(read)).at(-1);
  assert.ok(rebuilt !== undefined, "the read section keeps an observer after the resize");
  assert.equal(rebuilt.rootMargin, "-72px 0px 0px 0px", "the measured header height rebuilds the margin");

  const readObserver = rebuilt;
  const readBox = { top: 100, right: 800, bottom: 200, left: 0, width: 800, height: 100 };
  readObserver.trigger([
    {
      target: read,
      isIntersecting: true,
      intersectionRatio: 1,
      boundingClientRect: readBox,
      intersectionRect: readBox,
      rootBounds: viewport,
    },
  ]);
  await flush();
  assert.equal(readLink.hasAttribute("data-read"), true, "a fully visible section records its read mark");
  readObserver.trigger([
    {
      target: read,
      isIntersecting: false,
      intersectionRatio: 0,
      boundingClientRect: { top: 700, right: 800, bottom: 800, left: 0, width: 800, height: 100 },
      intersectionRect: { top: 700, right: 800, bottom: 700, left: 0, width: 0, height: 0 },
      rootBounds: viewport,
    },
  ]);
  await flush();
  assert.equal(readLink.hasAttribute("data-read"), true, "leaving full visibility does not remove the read mark");

  assert.deepEqual(warns, [], "the scroll-spy page loads without console.warn");
  assert.deepEqual(errors, [], "the scroll-spy page loads without console.error");
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
