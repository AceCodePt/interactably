import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHighlighter } from "shiki";
import githubLight from "shiki/themes/github-light.mjs";
import githubDark from "shiki/themes/github-dark.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const site = path.join(root, "site");
const cdn = path.join(root, "dist", "cdn");
const out = path.join(root, "site-dist");

if (!existsSync(cdn)) {
  console.error(`[build-site] ${path.relative(root, cdn)} not found; run pnpm build first`);
  process.exit(1);
}

const COMMENT_LIGHT = "#59636e";
const COMMENT_DARK = "#8b949e";

function recolorComments(theme, foreground) {
  const tokenColors = theme.tokenColors.map((token) => {
    const scope = Array.isArray(token.scope) ? token.scope : token.scope ? [token.scope] : [];
    if (!scope.includes("comment")) return token;
    return { ...token, settings: { ...token.settings, foreground } };
  });
  return { ...theme, tokenColors };
}

const light = recolorComments(githubLight, COMMENT_LIGHT);
const dark = recolorComments(githubDark, COMMENT_DARK);

const highlighter = await createHighlighter({
  themes: [light, dark],
  langs: ["html", "typescript", "shellscript"],
});

const LANG_ALIASES = { sh: "shellscript", ts: "typescript" };

const NAMED_ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: "\u00a0",
  mdash: "\u2014",
  ndash: "\u2013",
  hellip: "\u2026",
  ldquo: "\u201c",
  rdquo: "\u201d",
  lsquo: "\u2018",
  rsquo: "\u2019",
  middot: "\u00b7",
  minus: "\u2212",
  times: "\u00d7",
  copy: "\u00a9",
  rarr: "\u2192",
  larr: "\u2190",
};

function decodeEntities(text) {
  return text.replace(/&(#(?:x[0-9a-fA-F]+|[0-9]+)|[a-zA-Z][a-zA-Z0-9]*);/g, (whole, body) => {
    if (body.startsWith("#")) {
      const hex = body[1] === "x" || body[1] === "X";
      const code = hex ? Number.parseInt(body.slice(2), 16) : Number.parseInt(body.slice(1), 10);
      if (Number.isInteger(code) && code > 0 && code <= 0x10ffff) {
        return String.fromCodePoint(code);
      }
      return whole;
    }
    return NAMED_ENTITIES[body] ?? whole;
  });
}

function attrValue(attrs, name) {
  const match = attrs.match(new RegExp(`\\b${name}="([^"]*)"`));
  return match?.[1];
}

function codeInner(inner) {
  const match = inner.match(/^\s*<code>([\s\S]*?)<\/code>\s*$/);
  return match ? match[1] : inner;
}

function rebuildPre(shikiHtml, id, dataLang) {
  const openEnd = shikiHtml.indexOf(">");
  const rest = shikiHtml.slice(openEnd + 1);
  const tag = shikiHtml
    .slice(0, openEnd)
    .replace(/class="[^"]*"/, "")
    .replace(/\s+tabindex="0"/, "")
    .replace(/style="([^"]*)"/, (_, style) => {
      const kept = style
        .split(";")
        .map((part) => part.trim())
        .filter((part) => part && !part.startsWith("background-color") && !part.startsWith("--shiki-dark-bg"));
      return kept.length > 0 ? ` style="${kept.join(";")}"` : "";
    });
  return `<pre class="code shiki" id="${id}" data-lang="${dataLang}"${tag.slice("<pre".length)}>${rest}`;
}

function highlightHtml(html) {
  let count = 0;
  const out = html.replace(/<pre class="code"([^>]*)>([\s\S]*?)<\/pre>/g, (whole, attrs, inner) => {
    const id = attrValue(attrs, "id");
    const dataLang = attrValue(attrs, "data-lang");
    if (id === undefined || dataLang === undefined || dataLang === "text") return whole;
    const lang = LANG_ALIASES[dataLang] ?? dataLang;
    const code = decodeEntities(codeInner(inner));
    const highlighted = highlighter.codeToHtml(code, {
      lang,
      themes: { light, dark },
    });
    count += 1;
    return rebuildPre(highlighted, id, dataLang);
  });
  return { html: out, count };
}

function copyDir(src, dest) {
  mkdirSync(dest, { recursive: true });
  for (const name of readdirSync(src)) {
    const from = path.join(src, name);
    const to = path.join(dest, name);
    if (statSync(from).isDirectory()) {
      copyDir(from, to);
    } else {
      copyFileSync(from, to);
    }
  }
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

let assets = 0;
for (const name of readdirSync(site)) {
  if (name === "vendor") continue;
  const from = path.join(site, name);
  const to = path.join(out, name);
  if (statSync(from).isDirectory()) {
    copyDir(from, to);
  } else {
    copyFileSync(from, to);
  }
  assets += 1;
}

let vendored = 0;
mkdirSync(path.join(out, "vendor"), { recursive: true });
for (const name of readdirSync(cdn)) {
  if (!name.endsWith(".js")) continue;
  copyFileSync(path.join(cdn, name), path.join(out, "vendor", name));
  vendored += 1;
}

let highlighted = 0;
for (const name of readdirSync(out)) {
  if (!name.endsWith(".html")) continue;
  const file = path.join(out, name);
  const result = highlightHtml(await readFile(file, "utf8"));
  if (result.count > 0) await writeFile(file, result.html);
  highlighted += result.count;
}

console.log(`[build-site] copied ${assets} static asset(s), vendored ${vendored} bundle(s), highlighted ${highlighted} code block(s) into site-dist`);