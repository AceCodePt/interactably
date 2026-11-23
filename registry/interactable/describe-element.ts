import { presentImplementationNames } from "@behaviors/implementation-registry.ts";

export function describeElement(el: Element): string {
  const localName = (el as { localName?: unknown }).localName;
  const tag = typeof localName === "string" && localName !== "" ? localName : (el as { tagName?: unknown }).tagName;
  const name = typeof tag === "string" && tag !== "" ? tag.toLowerCase() : "element";
  const id = (el as { id?: unknown }).id;
  const suffix = typeof id === "string" && id !== "" ? `#${id}` : "";
  const implementations = presentImplementationNames(el);
  const implementationSuffix = implementations.length > 0 ? ` ${implementations.join(" ")}` : "";
  return `<${name}${suffix}${implementationSuffix}>`;
}
