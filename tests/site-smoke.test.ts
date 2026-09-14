import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { JSDOM } from "jsdom";
import { setupJsdom, teardownJsdom, flush } from "@tests/jsdom.ts";

const siteDir = new URL("../site/", import.meta.url);
const indexUrl = new URL("index.html", siteDir);
const demoUrl = new URL("demo.js", siteDir);
const cdnDir = new URL("../dist/cdn/", import.meta.url);

const KNOWN_BUNDLES = new Set([
  "interactably-core",
  "attributable",
  "auto-grow",
  "condition",
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
  assert.ok(match !== null, "site/index.html has a <body>");
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
  const html = readFileSync(fileURLToPath(indexUrl), "utf8");
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

  // Mirror the deployed page: index.html is parsed first, then demo.js imports
  // the bundles (which register the implementations and their hosts), defines the
  // remaining hosts, and only then mounts the demo template, so every element is
  // created already upgraded with its full implements list.
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

  const demoTemplate = document.getElementById("demo");
  assert.ok(demoTemplate instanceof HTMLTemplateElement, "index.html carries the demo template");
  document.body.append(demoTemplate.content);

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