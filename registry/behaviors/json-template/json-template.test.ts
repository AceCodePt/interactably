import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import type { JSDOM } from "jsdom";
import { setupJsdom, teardownJsdom, flush } from "@tests/jsdom.ts";

let dom: JSDOM;

before(async () => {
  dom = setupJsdom();
  await import("@behaviors/json-template/json-template.ts");
  const host = await import("@behaviors/interactable-host.ts");
  host.defineInteractableHost("div");
  host.defineInteractableHost("button");
  host.defineInteractableHost("ul");
});

after(() => {
  teardownJsdom(dom);
});

beforeEach(() => {
  document.body.replaceChildren();
});

function source(id: string, json: unknown): HTMLScriptElement {
  const script = document.createElement("script");
  script.type = "application/json";
  script.id = id;
  script.textContent = JSON.stringify(json);
  document.body.appendChild(script);
  return script;
}

async function container(attributes: Record<string, string>, innerHTML: string): Promise<HTMLElement> {
  const el = document.createElement("div", { is: "interactable-div" }) as HTMLElement;
  el.setAttribute("implements", "json-template");
  for (const [name, value] of Object.entries(attributes)) el.setAttribute(name, value);
  el.innerHTML = innerHTML;
  document.body.appendChild(el);
  await flush();
  return el;
}

function rendered<T extends Element = HTMLElement>(el: HTMLElement, selector: string): T {
  const found = el.querySelector<T>(selector);
  assert.ok(found, `expected ${selector} in rendered output`);
  return found;
}

test("json-template interpolates text content", async () => {
  source("data-source", { name: "Alice", age: 30 });
  const el = await container(
    { "json-template-for": "data-source" },
    `<template><h2>{name}</h2><p>Age: {age}</p></template>`,
  );

  assert.equal(rendered(el, "h2").textContent, "Alice");
  assert.equal(rendered(el, "p").textContent, "Age: 30");
  assert.ok(el.querySelector("template"));
});

test("json-template interpolates mixed static and dynamic text", async () => {
  source("data-source", { name: "Sagi", type: "user" });
  const el = await container(
    { "json-template-for": "data-source" },
    `<template><div>Username: {name}</div></template>`,
  );

  assert.equal(rendered(el, "div").textContent, "Username: Sagi");
});

test("json-template interpolates attribute values", async () => {
  source("data-source", { id: 7, role: "admin" });
  const el = await container(
    { "json-template-for": "data-source" },
    `<template><div data-id="{id}" class="user-{role}">Content</div></template>`,
  );

  const div = rendered(el, "div");
  assert.equal(div.getAttribute("data-id"), "7");
  assert.equal(div.className, "user-admin");
});

test("json-template leaves on-* command attributes verbatim", async () => {
  source("data-source", { id: 7 });
  const el = await container(
    { "json-template-for": "data-source" },
    `<template><button on-click="#api.send({method: 'delete', id})">Delete</button></template>`,
  );

  const button = rendered(el, "button");
  assert.equal(button.getAttribute("on-click"), "#api.send({method: 'delete', id})");
});

test("json-template resolves nested dot paths", async () => {
  source("data-source", { user: { profile: { email: "test@example.com" } } });
  const el = await container(
    { "json-template-for": "data-source" },
    `<template><p>{user.profile.email}</p></template>`,
  );

  assert.equal(rendered(el, "p").textContent, "test@example.com");
});

test("json-template resolves bracket notation with indices", async () => {
  source("data-source", { items: [{ title: "First" }, { title: "Second" }] });
  const el = await container(
    { "json-template-for": "data-source" },
    `<template><p>{items[1].title}</p></template>`,
  );

  assert.equal(rendered(el, "p").textContent, "Second");
});

test("json-template resolves quoted bracket property names", async () => {
  source("data-source", { "first-name": "Alice", "email.address": "a@example.com" });
  const el = await container(
    { "json-template-for": "data-source" },
    `<template>
      <p>{obj["first-name"]}</p>
      <p>{obj["email.address"]}</p>
    </template>`,
  );

  const paragraphs = el.querySelectorAll("p");
  assert.equal(paragraphs[0]!.textContent, "");
  assert.equal(paragraphs[1]!.textContent, "");
});

test("json-template is safe on missing intermediate paths", async () => {
  source("data-source", { user: {} });
  const el = await container(
    { "json-template-for": "data-source" },
    `<template><p>{user.profile.email || "no-email@example.com"}</p></template>`,
  );

  assert.equal(rendered(el, "p").textContent, "no-email@example.com");
});

test("json-template renders missing paths as empty strings", async () => {
  source("data-source", { foo: "bar" });
  const el = await container(
    { "json-template-for": "data-source" },
    `<template><div>Value: {nonexistent.path}</div></template>`,
  );

  assert.equal(rendered(el, "div").textContent, "Value: ");
});

test("|| uses the fallback for falsy values", async () => {
  source("data-source", { count: 0, active: false, message: "" });
  const el = await container(
    { "json-template-for": "data-source" },
    `<template>
      <div>
        <span class="count">{count || 10}</span>
        <span class="active">{active || "N/A"}</span>
        <span class="message">{message || "No message"}</span>
      </div>
    </template>`,
  );

  assert.equal(rendered(el, ".count").textContent, "10");
  assert.equal(rendered(el, ".active").textContent, "N/A");
  assert.equal(rendered(el, ".message").textContent, "No message");
});

test("|| keeps the value when it is truthy", async () => {
  source("data-source", { name: "Alice" });
  const el = await container(
    { "json-template-for": "data-source" },
    `<template><p>{name || "Guest"}</p></template>`,
  );

  assert.equal(rendered(el, "p").textContent, "Alice");
});

test("?? preserves falsy non-nullish values", async () => {
  source("data-source", { count: 0, active: false, message: "" });
  const el = await container(
    { "json-template-for": "data-source" },
    `<template>
      <div>
        <span class="count">{count ?? 10}</span>
        <span class="active">{active ?? "N/A"}</span>
        <span class="message">{message ?? "No message"}</span>
      </div>
    </template>`,
  );

  assert.equal(rendered(el, ".count").textContent, "0");
  assert.equal(rendered(el, ".active").textContent, "false");
  assert.equal(rendered(el, ".message").textContent, "");
});

test("?? uses the fallback for null and undefined", async () => {
  source("data-source", { name: null });
  const el = await container(
    { "json-template-for": "data-source" },
    `<template><p>{name ?? "Unknown"}</p><p>{missing ?? "N/A"}</p></template>`,
  );

  const paragraphs = el.querySelectorAll("p");
  assert.equal(paragraphs[0]!.textContent, "Unknown");
  assert.equal(paragraphs[1]!.textContent, "N/A");
});

test("&& uses the fallback when the value is truthy", async () => {
  source("data-source", { name: "Alice", count: 5, active: true });
  const el = await container(
    { "json-template-for": "data-source" },
    `<template>
      <div>
        <span class="name">{name && "Name exists"}</span>
        <span class="count">{count && "Has items"}</span>
        <span class="active">{active && "Active user"}</span>
      </div>
    </template>`,
  );

  assert.equal(rendered(el, ".name").textContent, "Name exists");
  assert.equal(rendered(el, ".count").textContent, "Has items");
  assert.equal(rendered(el, ".active").textContent, "Active user");
});

test("&& renders nothing for falsy values", async () => {
  source("data-source", { count: 0, active: false, message: "" });
  const el = await container(
    { "json-template-for": "data-source" },
    `<template>
      <div>
        <span class="count">{count && "Has count"}</span>
        <span class="active">{active && "Is active"}</span>
        <span class="message">{message && "Has message"}</span>
      </div>
    </template>`,
  );

  assert.equal(rendered(el, ".count").textContent, "");
  assert.equal(rendered(el, ".active").textContent, "");
  assert.equal(rendered(el, ".message").textContent, "");
});

test("operators inside quoted fallback strings are literal", async () => {
  source("data-source", { message: null, active: true });
  const el = await container(
    { "json-template-for": "data-source" },
    `<template>
      <p>{message || "A || B"}</p>
      <p>{message ?? "X ?? Y"}</p>
      <p>{active && "Fish && Chips"}</p>
    </template>`,
  );

  const paragraphs = el.querySelectorAll("p");
  assert.equal(paragraphs[0]!.textContent, "A || B");
  assert.equal(paragraphs[1]!.textContent, "X ?? Y");
  assert.equal(paragraphs[2]!.textContent, "Fish && Chips");
});

test("quoted literals can appear on the left of an operator", async () => {
  source("data-source", {});
  const el = await container(
    { "json-template-for": "data-source" },
    `<template>
      <p>{"&&" && "||"}</p>
      <p>{"" || "fallback"}</p>
      <p>{"" ?? "fallback"}</p>
    </template>`,
  );

  const paragraphs = el.querySelectorAll("p");
  assert.equal(paragraphs[0]!.textContent, "||");
  assert.equal(paragraphs[1]!.textContent, "fallback");
  assert.equal(paragraphs[2]!.textContent, "");
});

test("whitespace around operators is tolerated", async () => {
  source("data-source", {});
  const el = await container(
    { "json-template-for": "data-source" },
    `<template><p>{ name  ||  "Guest" }</p></template>`,
  );

  assert.equal(rendered(el, "p").textContent, "Guest");
});

test("all three operators can appear in one interpolation", async () => {
  source("data-source", { verified: true, score: 0, status: null });
  const el = await container(
    { "json-template-for": "data-source" },
    `<template><p>{verified && "✓"} Score: {score ?? "N/A"} - {status || "Unknown"}</p></template>`,
  );

  assert.equal(rendered(el, "p").textContent, "✓ Score: 0 - Unknown");
});

test("root arrays render the template once per item", async () => {
  source("data-source", [
    { title: "Buy groceries", done: false },
    { title: "Walk dog", done: true },
  ]);
  const el = await container(
    { "json-template-for": "data-source" },
    `<template><div class="todo"><span>{title}</span><input type="checkbox" checked="{done}"></div></template>`,
  );

  const todos = el.querySelectorAll(".todo");
  assert.equal(todos.length, 2);
  assert.equal(rendered(el, ".todo").textContent, "Buy groceries");
  assert.equal(todos[1]!.textContent, "Walk dog");
});

test("empty root arrays render nothing", async () => {
  source("data-source", []);
  const el = await container(
    { "json-template-for": "data-source" },
    `<template><div class="item">{name || "Empty"}</div></template>`,
  );

  assert.equal(el.querySelectorAll(".item").length, 0);
  assert.ok(el.querySelector("template"));
});

test("nested arrays render via data-array", async () => {
  source("data-source", {
    name: "Alice",
    projects: [
      { title: "BehaviorFN", stars: 100 },
      { title: "AutoWC", stars: 50 },
    ],
  });
  const el = await container(
    { "json-template-for": "data-source" },
    `<template>
      <h2>{name}</h2>
      <ul>
        <template data-array="projects">
          <li>{title}: {stars ?? 0} ⭐</li>
        </template>
      </ul>
    </template>`,
  );

  assert.equal(rendered(el, "h2").textContent, "Alice");
  const items = el.querySelectorAll("li");
  assert.equal(items.length, 2);
  assert.equal(items[0]!.textContent, "BehaviorFN: 100 ⭐");
  assert.equal(items[1]!.textContent, "AutoWC: 50 ⭐");
});

test("empty nested arrays render nothing", async () => {
  source("data-source", { name: "Alice", projects: [] });
  const el = await container(
    { "json-template-for": "data-source" },
    `<template>
      <h2>{name}</h2>
      <ul>
        <template data-array="projects">
          <li>{title}</li>
        </template>
      </ul>
    </template>`,
  );

  assert.equal(rendered(el, "h2").textContent, "Alice");
  assert.equal(el.querySelectorAll("li").length, 0);
});

test("deeply nested arrays render recursively", async () => {
  source("data-source", {
    departments: [
      {
        name: "Engineering",
        employees: [{ name: "Alice" }, { name: "Bob" }],
      },
    ],
  });
  const el = await container(
    { "json-template-for": "data-source" },
    `<template>
      <div>
        <template data-array="departments">
          <h3>{name}</h3>
          <ul>
            <template data-array="employees">
              <li>{name || "Unknown"}</li>
            </template>
          </ul>
        </template>
      </div>
    </template>`,
  );

  assert.equal(rendered(el, "h3").textContent, "Engineering");
  const names = el.querySelectorAll("li");
  assert.equal(names.length, 2);
  assert.equal(names[0]!.textContent, "Alice");
  assert.equal(names[1]!.textContent, "Bob");
});

test("is= attributes inside the template are preserved on render", async () => {
  source("data-source", { label: "Save" });
  const el = await container(
    { "json-template-for": "data-source" },
    `<template><button is="interactable-button">{label}</button></template>`,
  );

  const button = rendered(el, "button");
  assert.equal(button.getAttribute("is"), "interactable-button");
  assert.equal(button.textContent, "Save");
});

test("updates to the data source re-render via MutationObserver", async () => {
  const script = source("data-source", { count: 1 });
  const el = await container(
    { "json-template-for": "data-source" },
    `<template><div>Count: {count}</div></template>`,
  );
  assert.equal(rendered(el, "div").textContent, "Count: 1");

  script.textContent = JSON.stringify({ count: 42 });
  await flush();

  assert.equal(rendered(el, "div").textContent, "Count: 42");
});

test("root arrays re-render on empty -> populated -> empty transitions", async () => {
  const script = source("data-source", []);
  const el = await container(
    { "json-template-for": "data-source" },
    `<template><div class="item">{name || "Empty"}</div></template>`,
  );

  assert.equal(el.querySelectorAll(".item").length, 0);

  script.textContent = JSON.stringify([{ name: "Alice" }, { name: "Bob" }]);
  await flush();
  assert.equal(el.querySelectorAll(".item").length, 2);
  assert.equal(el.querySelectorAll(".item")[0]!.textContent, "Alice");
  assert.equal(el.querySelectorAll(".item")[1]!.textContent, "Bob");

  script.textContent = JSON.stringify([]);
  await flush();
  assert.equal(el.querySelectorAll(".item").length, 0);
  assert.ok(el.querySelector("template"));
});

test("json-template-slice renders a subset of a root array", async () => {
  source("data-source", [
    { name: "One" },
    { name: "Two" },
    { name: "Three" },
  ]);
  const el = await container(
    { "json-template-for": "data-source", "json-template-slice": "1:3" },
    `<template><div class="item">{name}</div></template>`,
  );

  const items = el.querySelectorAll(".item");
  assert.equal(items.length, 2);
  assert.equal(items[0]!.textContent, "Two");
  assert.equal(items[1]!.textContent, "Three");
});

test("a missing json-template-for logs an error and renders nothing", async () => {
  const errors: unknown[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => {
    errors.push(args[0]);
    original(...args);
  };
  try {
    const el = await container({}, `<template><div>{name}</div></template>`);
    assert.equal(el.querySelector("div"), null);
    assert.ok(el.querySelector("template"));
  } finally {
    console.error = original;
  }
  assert.ok(errors.some((message) => String(message).includes("json-template-for attribute is required")));
});

test("a missing data source element logs an error and renders nothing", async () => {
  const errors: unknown[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => {
    errors.push(args[0]);
    original(...args);
  };
  try {
    const el = await container(
      { "json-template-for": "nonexistent" },
      `<template><div>{name}</div></template>`,
    );
    assert.equal(el.querySelector("div"), null);
    assert.ok(el.querySelector("template"));
  } finally {
    console.error = original;
  }
  assert.ok(errors.some((message) => String(message).includes("data source element not found")));
});

test("invalid JSON in the data source logs an error and renders nothing", async () => {
  const script = document.createElement("script");
  script.type = "application/json";
  script.id = "bad-json";
  script.textContent = "{ invalid json }";
  document.body.appendChild(script);

  const errors: unknown[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => {
    errors.push(args[0]);
    original(...args);
  };
  try {
    const el = await container(
      { "json-template-for": "bad-json" },
      `<template><div>{name}</div></template>`,
    );
    assert.equal(el.querySelector("div"), null);
    assert.ok(el.querySelector("template"));
  } finally {
    console.error = original;
  }
  assert.ok(errors.some((message) => String(message).includes("invalid JSON in source element")));
});