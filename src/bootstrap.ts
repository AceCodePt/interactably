import { start } from "@/core.ts";

export * from "@/core.ts";

const implementations: Readonly<Record<string, () => Promise<unknown>>> = {
  attributable: () => import("@behaviors/attributable/attributable.ts"),
  "auto-grow": () => import("@behaviors/auto-grow/auto-grow.ts"),
  classable: () => import("@behaviors/classable/classable.ts"),
  copyable: () => import("@behaviors/copyable/copyable.ts"),
  dirtyable: () => import("@behaviors/dirtyable/dirtyable.ts"),
  focusable: () => import("@behaviors/focusable/focusable.ts"),
  formattable: () => import("@behaviors/formattable/formattable.ts"),
  logger: () => import("@behaviors/logger/logger.ts"),
  modifiable: () => import("@behaviors/modifiable/modifiable.ts"),
  "no-propagate": () => import("@behaviors/no-propagate/no-propagate.ts"),
  pastable: () => import("@behaviors/pastable/pastable.ts"),
  "prevent-default": () => import("@behaviors/prevent-default/prevent-default.ts"),
  renderable: () => import("@behaviors/renderable/renderable.ts"),
  requestable: () => import("@behaviors/requestable/requestable.ts"),
  revealable: () => import("@behaviors/revealable/revealable.ts"),
  storable: () => import("@behaviors/storable/storable.ts"),
  validatable: () => import("@behaviors/validatable/validatable.ts"),
};

const availableNames = Object.keys(implementations).sort();

export async function bootstrap(): Promise<void> {
  const declared = declaredNames();
  const unknown: string[] = [];
  const loads: Promise<unknown>[] = [];
  for (const name of declared) {
    const load = implementations[name];
    if (load === undefined) {
      unknown.push(name);
      continue;
    }
    loads.push(load());
  }
  await Promise.all(loads);
  start();
  if (unknown.length > 0) {
    const plural = unknown.length === 1 ? "" : "s";
    throw new Error(
      `[Interactably] unknown implementation${plural} ${unknown.map((name) => `"${name}"`).join(", ")}; ` +
        `available implementations: ${availableNames.join(", ")}`,
    );
  }
}

function declaredNames(): string[] {
  const names = new Set<string>();
  for (const tag of document.querySelectorAll("script[implementations]")) {
    const value = tag.getAttribute("implementations") ?? "";
    for (const name of value.split(/\s+/)) {
      if (name !== "") names.add(name);
    }
  }
  return [...names];
}

void bootstrap();
