const globals = globalThis as unknown as Record<string, unknown>;

const elementStandins: Record<string, unknown> = {
  HTMLTemplateElement: class HTMLTemplateElement {},
};

for (const [name, constructor] of Object.entries(elementStandins)) {
  if (globals[name] === undefined) globals[name] = constructor;
}
