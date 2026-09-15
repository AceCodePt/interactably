import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const distTypes = path.join(root, "dist", "types");
const distCdn = path.join(root, "dist", "cdn");

const aliasTargets = {
  "@/*": "src/",
  "@interactable/*": "registry/interactable/",
  "@behaviors/*": "registry/behaviors/",
  "@utils/*": "registry/utils/",
  "@tests/*": "tests/",
};

function resolveAlias(specifier) {
  for (const [alias, target] of Object.entries(aliasTargets)) {
    const prefix = alias.slice(0, -1);
    if (specifier.startsWith(prefix)) return target + specifier.slice(prefix.length);
  }
  return null;
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p));
    else if (entry.name.endsWith(".d.ts")) out.push(p);
  }
  return out;
}

const specifierPattern = /(\bfrom\s+|import\s*\(|import\s+)(["'])(@[^"']*)\2/g;

function rewrite(content, fromDir) {
  return content.replace(specifierPattern, (match, context, quote, specifier) => {
    const source = resolveAlias(specifier);
    if (source === null) return match;
    const target = path.join(distTypes, source.replace(/\.ts$/, ".d.ts"));
    let relative = path.relative(fromDir, target).replace(/\.d\.ts$/, ".js");
    if (!relative.startsWith(".")) relative = `./${relative}`;
    return context + quote + relative + quote;
  });
}

const mirrorFiles = walk(distTypes);
const raw = new Map(mirrorFiles.map((file) => [file, readFileSync(file, "utf8")]));

const outputs = new Map();
for (const file of mirrorFiles) {
  outputs.set(file, rewrite(raw.get(file), path.dirname(file)));
}

const srcIndex = path.join(distTypes, "src", "index.d.ts");
if (raw.has(srcIndex)) {
  outputs.set(path.join(distTypes, "index.d.ts"), rewrite(raw.get(srcIndex), distTypes));
}

const srcCore = path.join(distTypes, "src", "core.d.ts");
if (raw.has(srcCore)) {
  outputs.set(path.join(distCdn, "interactably-core.d.ts"), rewrite(raw.get(srcCore), distCdn));
}

const behaviorsDir = path.join(distTypes, "registry", "behaviors");
for (const entry of readdirSync(behaviorsDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const implDts = path.join(behaviorsDir, entry.name, `${entry.name}.d.ts`);
  if (raw.has(implDts)) {
    outputs.set(path.join(distCdn, `${entry.name}.d.ts`), rewrite(raw.get(implDts), distCdn));
  }
}

const autoLoaderDts = path.join(distTypes, "registry", "utils", "auto-loader.d.ts");
if (raw.has(autoLoaderDts)) {
  outputs.set(path.join(distCdn, "auto-loader.d.ts"), rewrite(raw.get(autoLoaderDts), distCdn));
}

for (const [file, content] of outputs) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content);
}

console.log(`rewrote declarations for ${outputs.size} files`);