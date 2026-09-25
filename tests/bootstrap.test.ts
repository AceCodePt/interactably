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
async function loadBootstrap(): Promise<{ bootstrap: () => Promise<void> }> {
  nextQuery += 1;
  return import(`${bootstrapUrl.href}?test=${nextQuery}`) as Promise<{ bootstrap: () => Promise<void> }>;
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

  useHead('<script type="module" implementations=""></script>');
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
  useHead(`<script type="module" implementations="${IMPLEMENTATION_NAMES.join(" ")}"></script>`);
  document.body.innerHTML = '<div id="r" implements="revealable" hidden></div>';

  await loadBootstrap();
  await flush();

  for (const name of IMPLEMENTATION_NAMES) {
    assert.ok(core.getImplementationDef(name), `${name} registered from the declaring tag`);
  }
});

test("bootstrap: an unknown name rejects observably and still attaches the recognised ones", async (t) => {
  const dom: JSDOM = setupJsdom();
  t.after(() => teardownJsdom(dom));

  // Import with a valid declaration: the auto-run path leaves a rejection
  // unhandled (that is the loud mechanism), so a test that names an unknown
  // implementation must assert the exported bootstrap() directly instead of
  // letting the auto-run kill the runner.
  useHead('<script type="module" implementations="revealable"></script>');
  document.body.innerHTML =
    '<button id="b" on-click="#r.show()">x</button><div id="r" implements="revealable" hidden></div>';

  const mod = await loadBootstrap();
  await flush();

  useHead('<script type="module" implementations="revealable definitely-not-real"></script>');
  await assert.rejects(mod.bootstrap(), (error: unknown) => {
    assert.ok(error instanceof Error, "the failure is an Error");
    assert.match(error.message, /definitely-not-real/, "the unknown name is named");
    assert.match(error.message, /available implementations/, "the error lists what is available");
    assert.match(error.message, /revealable/, "the available list names a real implementation");
    return true;
  });

  document.getElementById("b")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await flush();
  assert.equal(document.getElementById("r")!.hidden, false, "the recognised implementation still attached");
});

test("bootstrap: two declaring tags union their lists and start is idempotent per root", async (t) => {
  const dom: JSDOM = setupJsdom();
  t.after(() => teardownJsdom(dom));

  useHead(
    '<script type="module" implementations="revealable"></script>' +
      '<script type="module" implementations="attributable"></script>',
  );
  document.body.innerHTML =
    '<div id="r" implements="revealable" hidden></div><div id="a" implements="attributable"></div>';

  await loadBootstrap();
  await flush();

  const core = await import(coreUrl.href);
  assert.strictEqual(core.start(), core.start(), "start() is idempotent per root");
});

test("bootstrap: a declaration at the end of the body is read", async (t) => {
  const dom: JSDOM = setupJsdom();
  t.after(() => teardownJsdom(dom));

  // Import with the declaration in the head so the auto-run has a valid page.
  useHead('<script type="module" implementations="revealable"></script>');
  const mod = await loadBootstrap();
  await flush();

  document.body.innerHTML =
    '<div id="r" implements="revealable" hidden></div>' +
    '<script type="module" implementations="revealable body-only-unknown"></script>';

  await assert.rejects(
    mod.bootstrap(),
    /body-only-unknown/,
    "the body-placed script[implementations] was read",
  );
});
