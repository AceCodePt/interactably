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

test("vocabulary: config and state attribute keys are exposed", () => {
  const requestable = vocabulary.byName.get("requestable");
  assert.ok(requestable);
  assert.equal(requestable.configAttributes.get("requestable-url"), "string | undefined");
  assert.equal(
    requestable.configAttributes.get("requestable-method"),
    "'get' | 'post' | 'put' | 'delete' | 'patch' | undefined",
  );
  assert.equal(requestable.stateAttributes.get("requestable-status"), "'loading' | 'error' | undefined");

  const revealable = vocabulary.byName.get("revealable");
  assert.ok(revealable);
  assert.equal(revealable.configAttributes.get("revealable-modal"), "boolean | undefined");
  assert.equal(revealable.stateAttributes.get("revealable-open"), "boolean | undefined");
});

test("vocabulary: each event exposes its fields, open flag and owner", () => {
  const requestable = vocabulary.byName.get("requestable");
  assert.ok(requestable);
  const response = requestable.eventInfo.get("response");
  assert.ok(response);
  assert.equal(response.open, true);
  assert.equal(response.fields.get("html"), "string");
  assert.equal(response.fields.get("status"), "number");

  const pastable = vocabulary.byName.get("pastable");
  const pasted = pastable?.eventInfo.get("pasted");
  assert.ok(pasted);
  assert.equal(pasted.open, false);
  assert.equal(pasted.fields.get("text"), "string");

  assert.equal(vocabulary.eventOwners.get("response"), "requestable");
  assert.equal(vocabulary.eventOwners.get("pasted"), "pastable");
  assert.equal(vocabulary.eventOwners.get("invalid"), "validatable");
  assert.equal(vocabulary.eventOwners.get("rendered"), "renderable");
});
