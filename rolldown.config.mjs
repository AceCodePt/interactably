import { defineConfig } from "rolldown";
import { rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

rmSync("dist", { recursive: true, force: true });

const root = path.dirname(fileURLToPath(import.meta.url));

const implementations = [
  "attributable",
  "auto-grow",
  "copyable",
  "dirtyable",
  "formattable",
  "listable",
  "logger",
  "modifiable",
  "no-propagate",
  "pastable",
  "prevent-default",
  "requestable",
  "revealable",
  "storable",
  "validatable",
];

const coreFiles = [
  "registry/interactable/attachment.ts",
  "registry/interactable/attributes.ts",
  "registry/interactable/dispatch.ts",
  "registry/interactable/events.ts",
  "registry/interactable/executor.ts",
  "registry/interactable/implementation-event.ts",
  "registry/interactable/intersect.ts",
  "registry/interactable/measure.ts",
  "registry/interactable/interaction-event.ts",
  "registry/interactable/keys.ts",
  "registry/interactable/parser.ts",
  "registry/interactable/signature.ts",
  "registry/interactable/start.ts",
  "registry/behaviors/_implementation-definition.ts",
  "registry/behaviors/implementation-registry.ts",
  "registry/behaviors/implementation-utils.ts",
];

const coreModuleIds = new Set(coreFiles.map((file) => path.join(root, file)));
const coreSpecifier = "./interactably-core.js";

const aliasTargets = {
  "@/*": "./src/*",
  "@interactable/*": "./registry/interactable/*",
  "@behaviors/*": "./registry/behaviors/*",
  "@utils/*": "./registry/utils/*",
  "@tests/*": "./tests/*",
};

function resolveAlias(source) {
  for (const [alias, target] of Object.entries(aliasTargets)) {
    const prefix = alias.slice(0, -1);
    if (source.startsWith(prefix)) {
      return path.join(root, target.slice(0, -1), source.slice(prefix.length));
    }
  }
  return null;
}

function externalizeCore() {
  return {
    name: "externalize-core",
    resolveId(source, importer) {
      if (importer === undefined) return null;
      let resolved;
      if (source.startsWith(".")) {
        resolved = path.resolve(path.dirname(importer), source);
      } else {
        resolved = resolveAlias(source);
        if (resolved === null) return null;
      }
      if (coreModuleIds.has(resolved)) return { id: coreSpecifier, external: true };
      return null;
    },
  };
}

const externals = ["tsyntax"];

const implementationInputs = {};
for (const name of implementations) {
  implementationInputs[name] = path.join(root, "registry", "behaviors", name, `${name}.ts`);
}

export default defineConfig([
  {
    tsconfig: "./tsconfig.json",
    input: path.join(root, "src", "index.ts"),
    external: externals,
    output: {
      format: "esm",
      file: "dist/interactably.js",
    },
  },
  {
    tsconfig: "./tsconfig.json",
    input: path.join(root, "src", "core.ts"),
    output: {
      format: "esm",
      file: "dist/cdn/interactably-core.js",
    },
  },
  {
    tsconfig: "./tsconfig.json",
    input: implementationInputs,
    plugins: [externalizeCore()],
    output: {
      format: "esm",
      dir: "dist/cdn",
      entryFileNames: "[name].js",
    },
  },
  {
    tsconfig: "./tsconfig.json",
    input: path.join(root, "site", "demo.src.js"),
    treeshake: { moduleSideEffects: (id) => true },
    output: {
      format: "esm",
      file: "dist/site/demo.js",
    },
  },
]);