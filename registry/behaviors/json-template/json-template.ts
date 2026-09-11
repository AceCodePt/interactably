import { defineImplementation } from "../_implementation-definition.ts";

type Operator = "||" | "??" | "&&";

interface Interpolation {
  path: string;
  operator: Operator | null;
  fallback: string | number | boolean | null;
}

export const jsonTemplate = defineImplementation("json-template", {
  config: {
    for: "string | undefined",
    slice: "string | undefined",
  },
  verbs: {},
}, (el, attrs) => {
  let observer: MutationObserver | null = null;
  let sourceElement: HTMLElement | null = null;

  const render = (): void => {
    const dataSourceId = attrs.for;
    if (dataSourceId === undefined) {
      console.error("[Interactable] json-template: json-template-for attribute is required");
      return;
    }
    const source = document.getElementById(dataSourceId);
    if (source === null) {
      console.error(`[Interactable] json-template: data source element not found: ${dataSourceId}`);
      return;
    }
    sourceElement = source;

    const template = el.querySelector(":scope > template");
    if (!(template instanceof HTMLTemplateElement)) {
      console.error("[Interactable] json-template: no <template> element found as direct child");
      return;
    }

    const jsonText = (source.textContent ?? "").trim();
    if (jsonText === "") return;

    let jsonData: unknown;
    try {
      jsonData = JSON.parse(jsonText);
    } catch (error) {
      console.error("[Interactable] json-template: invalid JSON in source element", error);
      return;
    }

    if (Array.isArray(jsonData)) {
      let itemsToRender = jsonData;
      const slice = attrs.slice;
      if (slice !== undefined) {
        const { start, end } = parseSlice(slice);
        itemsToRender = jsonData.slice(start, end);
      }
      renderRootArray(el, template, itemsToRender);
      return;
    }

    renderObject(el, template, jsonData);
  };

  const setupObserver = (): void => {
    if (sourceElement === null) return;
    observer = new MutationObserver(() => render());
    observer.observe(sourceElement, { characterData: true, childList: true, subtree: true });
  };

  return {
    connectedCallback: () => {
      render();
      setupObserver();
    },
    disconnectedCallback: () => {
      observer?.disconnect();
      observer = null;
    },
  };
});

function renderObject(el: HTMLElement, template: HTMLTemplateElement, data: unknown): void {
  const clone = template.content.cloneNode(true) as DocumentFragment;
  for (const child of Array.from(clone.childNodes)) processInterpolation(child, data);
  replaceContent(el, template, clone);
}

function renderRootArray(el: HTMLElement, template: HTMLTemplateElement, items: unknown[]): void {
  const fragment = document.createDocumentFragment();
  if (items.length === 0) {
    const itemClone = template.content.cloneNode(true) as DocumentFragment;
    for (const child of Array.from(itemClone.childNodes)) processInterpolation(child, {});
    fragment.appendChild(itemClone);
    replaceContent(el, template, fragment);
    return;
  }
  for (const item of items) {
    const itemClone = template.content.cloneNode(true) as DocumentFragment;
    for (const child of Array.from(itemClone.childNodes)) processInterpolation(child, item);
    fragment.appendChild(itemClone);
  }
  replaceContent(el, template, fragment);
}

function replaceContent(el: HTMLElement, template: HTMLTemplateElement, fragment: DocumentFragment): void {
  for (const child of Array.from(el.childNodes)) {
    if (child !== template) child.remove();
  }
  el.insertBefore(fragment, template);
}

function processInterpolation(element: Node, data: unknown): void {
  if (element.nodeType === Node.TEXT_NODE) {
    const text = element.textContent ?? "";
    if (text.includes("{")) element.textContent = interpolateString(text, data);
    return;
  }
  if (element.nodeType !== Node.ELEMENT_NODE) return;

  const el = element as Element;

  const arrayPath = el.getAttribute("data-array");
  if (arrayPath !== null && el instanceof HTMLTemplateElement) {
    const arrayData = resolvePath(data, arrayPath);
    if (!Array.isArray(arrayData)) {
      console.error(`[Interactable] json-template: expected array at path "${arrayPath}", got ${typeof arrayData}`);
      return;
    }
    const parent = el.parentElement;
    if (parent === null) {
      console.error("[Interactable] json-template: array template has no parent element");
      return;
    }
    for (const item of arrayData) {
      const itemClone = el.content.cloneNode(true) as DocumentFragment;
      for (const child of Array.from(itemClone.childNodes)) processInterpolation(child, item);
      parent.insertBefore(itemClone, el);
    }
    return;
  }

  for (const attr of Array.from(el.attributes)) {
    if (attr.value.includes("{")) attr.value = interpolateString(attr.value, data);
  }

  for (const child of Array.from(el.childNodes)) processInterpolation(child, data);
}

const LITERAL_PREFIX = "__LITERAL__:";

function interpolateString(text: string, data: unknown): string {
  return text.replace(/\{([^}]+)\}/g, (_match, expr: string) => {
    const { path, operator, fallback } = parseInterpolation(expr);

    let value: unknown;
    if (path.startsWith(LITERAL_PREFIX)) {
      value = path.slice(LITERAL_PREFIX.length);
    } else {
      value = resolvePath(data, path);
    }

    let finalValue: unknown = value;
    if (operator === "||") {
      if (!value) finalValue = fallback;
    } else if (operator === "??") {
      if (value === null || value === undefined) finalValue = fallback;
    } else if (operator === "&&") {
      if (value) finalValue = fallback;
    } else {
      if (value === undefined || value === null) return "";
    }

    if (
      typeof finalValue === "string" ||
      typeof finalValue === "number" ||
      typeof finalValue === "boolean"
    ) {
      return String(finalValue);
    }
    return "";
  });
}

function parseInterpolation(expr: string): Interpolation {
  const trimmed = expr.trim();

  let operatorIndex = -1;
  let operator: Operator | null = null;
  let insideQuote = "";

  for (let i = 0; i < trimmed.length - 1; i++) {
    const char = trimmed[i]!;
    const nextChar = trimmed[i + 1]!;
    if ((char === '"' || char === "'") && insideQuote === "") {
      insideQuote = char;
    } else if (char === insideQuote && trimmed[i - 1] !== "\\") {
      insideQuote = "";
    }
    if (insideQuote === "") {
      if (char === "?" && nextChar === "?") {
        operatorIndex = i;
        operator = "??";
        break;
      }
    }
  }

  if (operator === null) {
    insideQuote = "";
    for (let i = 0; i < trimmed.length - 1; i++) {
      const char = trimmed[i]!;
      const nextChar = trimmed[i + 1]!;
      if ((char === '"' || char === "'") && insideQuote === "") {
        insideQuote = char;
      } else if (char === insideQuote && trimmed[i - 1] !== "\\") {
        insideQuote = "";
      }
      if (insideQuote === "") {
        if (char === "|" && nextChar === "|") {
          operatorIndex = i;
          operator = "||";
          break;
        }
        if (char === "&" && nextChar === "&") {
          operatorIndex = i;
          operator = "&&";
          break;
        }
      }
    }
  }

  if (operator === null || operatorIndex === -1) {
    return { path: trimmed, operator: null, fallback: null };
  }

  const pathExpr = trimmed.slice(0, operatorIndex).trim();
  const fallbackExpr = trimmed.slice(operatorIndex + 2).trim();

  let path: string;
  const pathQuotedMatch = pathExpr.match(/^(['"])(.*)\1$/);
  if (pathQuotedMatch !== null) {
    path = `${LITERAL_PREFIX}${pathQuotedMatch[2]!}`;
  } else {
    path = pathExpr;
  }

  let fallback: string | number | boolean | null = null;
  const quotedMatch = fallbackExpr.match(/^(['"])(.*)\1$/);
  if (quotedMatch !== null) {
    fallback = quotedMatch[2]!;
  } else if (fallbackExpr === "true") {
    fallback = true;
  } else if (fallbackExpr === "false") {
    fallback = false;
  } else {
    const num = Number(fallbackExpr);
    fallback = Number.isNaN(num) ? fallbackExpr : num;
  }

  return { path, operator, fallback };
}

function resolvePath(data: unknown, path: string): unknown {
  if (!path || path.trim() === "") return undefined;

  const parts: string[] = [];
  let currentPart = "";
  let insideBrackets = 0;
  let insideQuote = "";

  for (let i = 0; i < path.length; i++) {
    const char = path[i]!;
    if (char === "[" && insideQuote === "") {
      insideBrackets++;
      currentPart += char;
    } else if (char === "]" && insideQuote === "") {
      insideBrackets--;
      currentPart += char;
    } else if ((char === '"' || char === "'") && insideBrackets > 0) {
      if (insideQuote === "") insideQuote = char;
      else if (insideQuote === char) insideQuote = "";
      currentPart += char;
    } else if (char === "." && insideBrackets === 0) {
      if (currentPart) {
        parts.push(currentPart);
        currentPart = "";
      }
    } else {
      currentPart += char;
    }
  }
  if (currentPart) parts.push(currentPart);

  let current: unknown = data;

  for (let part of parts) {
    if (current === null || current === undefined) return undefined;

    const beforeBrackets = part.match(/^([^[]+)(?=\[)/);
    if (beforeBrackets !== null) {
      const propName = beforeBrackets[1]!;
      if (typeof current === "object" && current !== null && propName in current) {
        current = (current as Record<string, unknown>)[propName];
        part = part.slice(propName.length);
      } else {
        return undefined;
      }
    }

    for (const match of part.matchAll(/\[(['"]?)(.+?)\1\]/g)) {
      if (current === null || current === undefined) return undefined;
      const quote = match[1]!;
      const keyOrIndex = match[2]!;
      if (quote) {
        if (typeof current === "object" && current !== null && keyOrIndex in current) {
          current = (current as Record<string, unknown>)[keyOrIndex];
        } else {
          return undefined;
        }
      } else {
        const index = Number.parseInt(keyOrIndex, 10);
        if (Array.isArray(current)) {
          const actualIndex = index < 0 ? current.length + index : index;
          if (actualIndex >= 0 && actualIndex < current.length) {
            current = current[actualIndex]!;
          } else {
            return undefined;
          }
        } else {
          return undefined;
        }
      }
    }

    if (beforeBrackets === null && !part.includes("[")) {
      if (typeof current === "object" && current !== null && part in current) {
        current = (current as Record<string, unknown>)[part];
      } else {
        return undefined;
      }
    }
  }

  return current;
}

function parseSlice(expr: string): { start?: number; end?: number } {
  const trimmed = expr.trim();
  if (!trimmed) return {};

  if (!trimmed.includes(":")) {
    const num = Number.parseInt(trimmed, 10);
    if (Number.isNaN(num)) {
      console.warn(`[Interactable] json-template: invalid slice syntax: "${expr}"`);
      return {};
    }
    return { start: num };
  }

  const colon = trimmed.indexOf(":");
  const startStr = trimmed.slice(0, colon);
  const endStr = trimmed.slice(colon + 1);
  const result: { start?: number; end?: number } = {};

  if (startStr.trim() !== "") {
    const start = Number.parseInt(startStr.trim(), 10);
    if (!Number.isNaN(start)) result.start = start;
  }
  if (endStr.trim() !== "") {
    const end = Number.parseInt(endStr.trim(), 10);
    if (!Number.isNaN(end)) result.end = end;
  }

  return result;
}