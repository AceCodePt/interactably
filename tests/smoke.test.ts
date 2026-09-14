import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { JSDOM } from "jsdom";
import { setupJsdom, teardownJsdom } from "@tests/jsdom.ts";

const coreUrl = new URL("../dist/cdn/behavior-fn-core.js", import.meta.url);
const implUrl = new URL("../dist/cdn/modifiable.js", import.meta.url);
const mainUrl = new URL("../dist/interactably.js", import.meta.url);

test("smoke: built CDN core and an implementation bundle load and share the registry", async (t) => {
  if (!existsSync(fileURLToPath(coreUrl)) || !existsSync(fileURLToPath(implUrl))) {
    t.skip("dist not built; run pnpm build first");
    return;
  }

  const dom: JSDOM = setupJsdom();
  t.after(() => teardownJsdom(dom));

  const core = await import(coreUrl.href);
  for (const name of ["defineImplementation", "defineInteractableHost", "registerImplementation", "runPhrases", "dispatchInteraction", "InteractionEvent"]) {
    assert.equal(typeof core[name], "function", `core exports ${name}`);
  }
  assert.equal(typeof core.parse, "function");
  assert.equal(typeof core.valueOf, "function");

  await import(implUrl.href);
  assert.ok(core.getImplementationDef("modifiable"), "dist/cdn/modifiable.js registers into the core registry");
});

test("smoke: built main bundle loads and exposes the core API", async (t) => {
  if (!existsSync(fileURLToPath(mainUrl))) {
    t.skip("dist not built; run pnpm build first");
    return;
  }

  const dom: JSDOM = setupJsdom();
  t.after(() => teardownJsdom(dom));

  const main = await import(mainUrl.href);
  for (const name of ["defineImplementation", "defineInteractableHost", "parse", "runPhrases", "dispatchInteraction", "InteractionEvent"]) {
    assert.equal(typeof main[name], "function", `main bundle exports ${name}`);
  }
  assert.ok(main.modifiable, "main bundle exports the modifiable implementation");
});