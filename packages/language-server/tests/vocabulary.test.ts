import { test } from "node:test";
import assert from "node:assert/strict";
import { vocabulary } from "./support.ts";

test("vocabulary: derived from the built-in implementations by declared name", () => {
  assert.equal(vocabulary.names.length, 17);
  assert.ok(vocabulary.byName.has("no-propagate"));
  assert.ok(vocabulary.byName.has("prevent-default"));
});

test("vocabulary: verbs, events and tags come from the definitions", () => {
  const modifiable = vocabulary.byName.get("modifiable");
  assert.ok(modifiable);
  assert.deepEqual([...modifiable.verbs.keys()].sort(), ["clear", "reset", "set"]);
  assert.equal(modifiable.verbs.get("set"), "string | number");
  assert.deepEqual(modifiable.tags, ["input", "textarea", "output", "select"]);

  const requestable = vocabulary.byName.get("requestable");
  assert.ok(requestable);
  assert.ok(requestable.events.includes("response"));
  assert.ok(requestable.events.includes("request-error"));

  assert.ok(vocabulary.byName.get("renderable")?.events.includes("rendered"));
  assert.ok(vocabulary.byName.get("copyable")?.events.includes("copy-error"));
});
