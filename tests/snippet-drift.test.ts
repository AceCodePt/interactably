import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const examplesDir = new URL("../site/examples/", import.meta.url);

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
  "todo-list",
  "number-format",
  "logging",
  "offline-fallback",
];

const dom = new JSDOM("<!doctype html>");
const document = dom.window.document;

function readExample(name: string): string {
  return readFileSync(fileURLToPath(new URL(`${name}.html`, examplesDir)), "utf8");
}

function extractDemo(html: string): string {
  const start = html.indexOf('<div class="demo">');
  assert.notEqual(start, -1, "the page has a demo");
  const openLength = '<div class="demo">'.length;
  const tag = /<div\b|<\/div>/g;
  tag.lastIndex = start;
  let depth = 0;
  let match: RegExpExecArray | null;
  while ((match = tag.exec(html)) !== null) {
    if (match[0] === "<div") {
      depth += 1;
    } else {
      depth -= 1;
      if (depth === 0) return html.slice(start + openLength, match.index);
    }
  }
  throw new Error("the demo div never closes");
}

function extractSnippet(html: string): string {
  const match = /<pre class="code"[^>]*><code>([\s\S]*?)<\/code><\/pre>/.exec(html);
  assert.ok(match !== null, "the page has a code snippet");
  const textarea = document.createElement("textarea");
  textarea.innerHTML = match[1] ?? "";
  return textarea.value;
}

function isAttributed(el: Element): boolean {
  return (
    el.hasAttribute("implements") ||
    el.getAttributeNames().some((name) => name.startsWith("on-"))
  );
}

function interactionNames(el: Element): string[] {
  return el
    .getAttributeNames()
    .filter((name) => name === "implements" || name.startsWith("on-"))
    .sort();
}

function fingerprints(root: Element): Map<string, number> {
  const counts = new Map<string, number>();
  for (const el of Array.from(root.querySelectorAll("*"))) {
    if (!isAttributed(el)) continue;
    const key = `${el.localName.toLowerCase()}[${interactionNames(el).join(",")}]`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function fetchedFragments(html: string): string {
  const parts: string[] = [];
  const seen = new Set<string>();
  for (const match of html.matchAll(/requestable-url="([^"]+)"/g)) {
    const url = match[1]!;
    if (seen.has(url)) continue;
    seen.add(url);
    const file = fileURLToPath(new URL(url, examplesDir));
    if (existsSync(file)) parts.push(readFileSync(file, "utf8"));
  }
  return parts.join("\n");
}

function count(pattern: RegExp, text: string): number {
  return (text.match(pattern) ?? []).length;
}

test("storable restore sites are one per distinct value", () => {
  const theme = extractDemo(readExample("remember-theme"));
  assert.equal(count(/on-load="this\.restore\(\)"/g, theme), 1, "remember-theme has one restore site");
  assert.equal(count(/on-restore\(/g, theme), 1, "and one on-restore handler");

  const tab = extractDemo(readExample("remembered-tab"));
  assert.equal(count(/on-load="this\.restore\(\)"/g, tab), 1, "remembered-tab has one restore site");
  assert.equal(count(/on-restore\(/g, tab), 3, "its one site matches each stored literal");

  const synced = extractDemo(readExample("synced-sections"));
  assert.equal(count(/on-load="this\.restore\(\)"/g, synced), 3, "synced-sections has one restore site per value");
  for (const value of ["npm", "bun", "pnpm"]) {
    assert.equal(
      count(new RegExp(`on-restore\\(value:\`${value}\`\\)`, "g"), synced),
      1,
      `exactly one literal restore site for ${value}`,
    );
  }
});

test("every example's snippet carries exactly the demo's attributed elements", () => {
  for (const name of EXAMPLE_PAGES) {
    const html = readExample(name);
    const demo = document.createElement("div");
    demo.innerHTML = extractDemo(html) + "\n" + fetchedFragments(html);
    const snippet = document.createElement("div");
    snippet.innerHTML = extractSnippet(html);

    const inDemo = fingerprints(demo);
    const inSnippet = fingerprints(snippet);

    for (const [shape, count] of inDemo) {
      assert.equal(
        inSnippet.get(shape) ?? 0,
        count,
        `${name}: the snippet is missing ${count - (inSnippet.get(shape) ?? 0)} attributed ${shape} element(s) the demo has`,
      );
    }
    for (const [shape, count] of inSnippet) {
      assert.equal(
        inDemo.get(shape) ?? 0,
        count,
        `${name}: the snippet has ${count - (inDemo.get(shape) ?? 0)} attributed ${shape} element(s) the demo does not`,
      );
    }
  }
});
