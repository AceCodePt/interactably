import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { JSDOM } from "jsdom";
import { setupJsdom, teardownJsdom, flush } from "@tests/jsdom.ts";

const cdnDir = new URL("../dist/cdn/", import.meta.url);
const bootstrapUrl = new URL("interactably-bootstrap.js", cdnDir);
const coreUrl = new URL("interactably-core.js", cdnDir);

const IMPLEMENTATION_NAMES = [
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
];

let nextQuery = 0;
async function loadBootstrap(): Promise<void> {
  nextQuery += 1;
  await import(`${bootstrapUrl.href}?test=${nextQuery}`);
}

function captureErrors(): { messages: string[]; restore: () => void } {
  const messages: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => {
    messages.push(args.map(String).join(" "));
  };
  return { messages, restore: () => (console.error = original) };
}

function useHead(markup: string): void {
  document.head.innerHTML = markup;
}

test("bootstrap: built artifact exists", (t) => {
  if (!existsSync(fileURLToPath(bootstrapUrl)) || !existsSync(fileURLToPath(coreUrl))) {
    t.skip("dist not built; run pnpm build first");
  }
});

test("bootstrap: an empty declaration evaluates no implementation and still starts", async (t) => {
  const dom: JSDOM = setupJsdom();
  t.after(() => teardownJsdom(dom));

  const core = await import(coreUrl.href);

  let probed = false;
  core.defineImplementation("probe", { verbs: {} }, () => ({
    connectedCallback: () => {
      probed = true;
    },
  }));

  useHead('<script type="module" implements=""></script>');
  const holder = document.createElement("div");
  holder.innerHTML = '<div id="probe-target" implements="probe"></div>';
  document.body.appendChild(holder);

  await loadBootstrap();
  await flush();

  assert.equal(probed, true, "start() ran and attached the participant");
  for (const name of IMPLEMENTATION_NAMES) {
    assert.equal(core.getImplementationDef(name), undefined, `${name} was not evaluated`);
  }
});

test("bootstrap: every built-in resolves by its declared name", async (t) => {
  const dom: JSDOM = setupJsdom();
  t.after(() => teardownJsdom(dom));

  const core = await import(coreUrl.href);
  useHead(`<script type="module" implements="${IMPLEMENTATION_NAMES.join(" ")}"></script>`);
  document.body.innerHTML = '<div id="r" implements="revealable" hidden></div>';

  await loadBootstrap();
  await flush();

  for (const name of IMPLEMENTATION_NAMES) {
    assert.ok(core.getImplementationDef(name), `${name} registered from the declaring tag`);
  }
});

test("bootstrap: an unknown name reports and still attaches the recognised ones", async (t) => {
  const dom: JSDOM = setupJsdom();
  t.after(() => teardownJsdom(dom));

  const { messages, restore } = captureErrors();
  t.after(restore);

  useHead('<script type="module" implements="revealable definitely-not-real"></script>');
  document.body.innerHTML =
    '<button id="b" on-click="#r.show()">x</button><div id="r" implements="revealable" hidden></div>';

  await loadBootstrap();
  await flush();

  const report = messages.find((message) => message.includes("definitely-not-real"));
  assert.ok(report !== undefined, `the unknown name is reported: ${JSON.stringify(messages)}`);
  assert.ok(report.includes("available implementations"), "the error lists what is available");
  assert.ok(report.includes("revealable"), "the available list names a real implementation");

  document.getElementById("b")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await flush();
  assert.equal(document.getElementById("r")!.hidden, false, "the recognised implementation still attached");
});

test("bootstrap: two declaring tags union their lists and start is idempotent per root", async (t) => {
  const dom: JSDOM = setupJsdom();
  t.after(() => teardownJsdom(dom));

  useHead(
    '<script type="module" implements="revealable"></script>' +
      '<script type="module" implements="attributable"></script>',
  );
  document.body.innerHTML =
    '<div id="r" implements="revealable" hidden></div><div id="a" implements="attributable"></div>';

  await loadBootstrap();
  await flush();

  const core = await import(coreUrl.href);
  assert.strictEqual(core.start(), core.start(), "start() is idempotent per root");
});
