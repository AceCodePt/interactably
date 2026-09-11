import { defineConfig } from "rolldown";
import { rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

rmSync("dist", { recursive: true, force: true });

const root = path.dirname(fileURLToPath(import.meta.url));

const implementations = [
  "attributable",
  "auto-grow",
  "compute",
  "condition",
  "dirtyable",
  "element-counter",
  "format",
  "json-template",
  "listable",
  "logger",
  "modifiable",
  "no-propagate",
  "paste-transform",
  "prevent-default",
  "requestable",
  "revealable",
  "storage",
  "summable",
  "validatable",
];

const coreFiles = [
  "registry/interactable/attributes.ts",
  "registry/interactable/dispatch.ts",
  "registry/interactable/events.ts",
  "registry/interactable/executor.ts",
  "registry/interactable/interaction-event.ts",
  "registry/interactable/keys.ts",
  "registry/interactable/parser.ts",
  "registry/interactable/signature.ts",
  "registry/behaviors/_implementation-definition.ts",
  "registry/behaviors/implementation-registry.ts",
  "registry/behaviors/implementation-utils.ts",
  "registry/behaviors/interactable-host.ts",
];

const coreModuleIds = new Set(coreFiles.map((file) => path.join(root, file)));
const coreSpecifier = "./behavior-fn-core.js";

function externalizeCore() {
  return {
    name: "externalize-core",
    resolveId(source, importer) {
      if (importer === undefined || !source.startsWith(".")) return null;
      const resolved = path.resolve(path.dirname(importer), source);
      if (coreModuleIds.has(resolved)) return { id: coreSpecifier, external: true };
      return null;
    },
  };
}

const externals = ["auto-wc", "tsyntax"];

const implementationInputs = {};
for (const name of implementations) {
  implementationInputs[name] = path.join(root, "registry", "behaviors", name, `${name}.ts`);
}

export default defineConfig([
  {
    input: path.join(root, "src", "index.ts"),
    external: externals,
    output: {
      format: "esm",
      file: "dist/interactably.js",
    },
  },
  {
    input: path.join(root, "src", "core.ts"),
    external: externals,
    output: {
      format: "esm",
      file: "dist/cdn/behavior-fn-core.js",
    },
  },
  {
    input: implementationInputs,
    external: externals,
    plugins: [externalizeCore()],
    output: {
      format: "esm",
      dir: "dist/cdn",
      entryFileNames: "[name].js",
    },
  },
]);