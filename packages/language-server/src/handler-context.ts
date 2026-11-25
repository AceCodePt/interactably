export interface HandlerContext {
  readonly kind: "parameter" | "body";
  readonly start: number;
  readonly declared: readonly string[];
  readonly bound: readonly string[];
}

interface ArrowInfo {
  readonly parameterStart: number;
  readonly parameterEnd: number;
  readonly arrow: number;
  readonly bodyStart: number | undefined;
  readonly bodyEnd: number | undefined;
}

const STRING_LITERAL = /^'(?:[^'\\]|\\.)*'$/;
const NUMBER_LITERAL = /^-?\d+(?:\.\d+)?$/;

export function handlerContextAt(text: string, offset: number): HandlerContext | null {
  const arrows = findArrows(text);

  for (const arrow of arrows) {
    if (offset >= arrow.parameterStart && offset <= arrow.parameterEnd) {
      const fields = parseFields(text.slice(arrow.parameterStart, arrow.parameterEnd));
      return contextFor("parameter", arrow.parameterStart, fields);
    }
    if (
      arrow.bodyStart !== undefined &&
      arrow.bodyEnd !== undefined &&
      offset > arrow.bodyStart &&
      offset <= arrow.bodyEnd
    ) {
      const fields = parseFields(text.slice(arrow.parameterStart, arrow.parameterEnd));
      return contextFor("body", arrow.bodyStart ?? arrow.arrow, fields);
    }
    if (
      arrow.bodyStart === undefined &&
      offset > arrow.arrow &&
      offset <= parameterEndOfArrow(text, arrow)
    ) {
      const fields = parseFields(text.slice(arrow.parameterStart, arrow.parameterEnd));
      return contextFor("body", arrow.bodyStart ?? arrow.arrow, fields);
    }
  }

  const open = openParameterBefore(text, offset, arrows);
  if (open !== -1) {
    return contextFor("parameter", open, parseFields(text.slice(open + 1, offset)));
  }
  return null;
}

function parameterEndOfArrow(text: string, arrow: ArrowInfo): number {
  return arrow.bodyStart ?? text.length;
}

function contextFor(
  kind: "parameter" | "body",
  start: number,
  fields: readonly ParsedField[],
): HandlerContext {
  return {
    kind,
    start,
    declared: fields.map((field) => field.name),
    bound: fields.filter((field) => !field.literal).map((field) => field.name),
  };
}

interface ParsedField {
  readonly name: string;
  readonly literal: boolean;
}

function parseFields(parameter: string): ParsedField[] {
  const fields: ParsedField[] = [];
  for (const piece of splitTopLevel(stripParameter(parameter))) {
    const colon = piece.indexOf(":");
    if (colon === -1) continue;
    const name = piece.slice(0, colon).trim();
    if (name === "") continue;
    const value = piece.slice(colon + 1).trim();
    const literal =
      STRING_LITERAL.test(value) ||
      NUMBER_LITERAL.test(value) ||
      value === "true" ||
      value === "false";
    fields.push({ name, literal });
  }
  return fields;
}

function stripParameter(parameter: string): string {
  let text = parameter.trim();
  if (text.startsWith("(")) text = text.slice(1);
  if (text.endsWith(")")) text = text.slice(0, -1);
  text = text.trim();
  if (text.startsWith("{")) text = text.slice(1);
  if (text.endsWith("}")) text = text.slice(0, -1);
  return text;
}

function splitTopLevel(text: string): string[] {
  const pieces: string[] = [];
  let current = "";
  let depth = 0;
  let quoted = false;
  for (let index = 0; index < text.length; index++) {
    const character = text[index]!;
    if (quoted) {
      current += character;
      if (character === "\\") {
        const next = text[index + 1];
        if (next !== undefined) {
          current += next;
          index += 1;
        }
      } else if (character === "'") {
        quoted = false;
      }
      continue;
    }
    if (character === "'") {
      quoted = true;
      current += character;
      continue;
    }
    if (character === "(" || character === "{") depth += 1;
    else if (character === ")" || character === "}") depth -= 1;
    if (character === "," && depth === 0) {
      pieces.push(current);
      current = "";
      continue;
    }
    current += character;
  }
  if (current.trim() !== "") pieces.push(current);
  return pieces;
}

function findArrows(text: string): ArrowInfo[] {
  const arrows: ArrowInfo[] = [];
  for (let index = 0; index + 1 < text.length; index++) {
    const character = text[index]!;
    if (character === "'") {
      index = skipString(text, index) - 1;
      continue;
    }
    if (character !== "=" || text[index + 1] !== ">") continue;
    const parameterEnd = previousNonSpace(text, index - 1);
    const parameterStart = parameterStartFor(text, parameterEnd);
    const bodyStart = nextNonSpace(text, index + 2);
    const hasBody = bodyStart < text.length && text[bodyStart] === "{";
    arrows.push({
      parameterStart,
      parameterEnd: parameterEnd + 1,
      arrow: index,
      bodyStart: hasBody ? bodyStart : undefined,
      bodyEnd: hasBody ? matchingBrace(text, bodyStart) : undefined,
    });
    index += 1;
  }
  return arrows;
}

function skipString(text: string, start: number): number {
  for (let index = start + 1; index < text.length; index++) {
    const character = text[index]!;
    if (character === "\\") {
      index += 1;
      continue;
    }
    if (character === "'") return index + 1;
  }
  return text.length;
}

function previousNonSpace(text: string, start: number): number {
  let index = start;
  while (index >= 0 && /\s/.test(text[index]!)) index -= 1;
  return index;
}

function nextNonSpace(text: string, start: number): number {
  let index = start;
  while (index < text.length && /\s/.test(text[index]!)) index += 1;
  return index;
}

function parameterStartFor(text: string, parameterEnd: number): number {
  if (parameterEnd < 0) return 0;
  if (text[parameterEnd] !== ")") {
    let index = parameterEnd;
    while (index > 0 && !/[[,{]/.test(text[index]!)) index -= 1;
    return index;
  }
  let depth = 0;
  let quoted = false;
  for (let index = parameterEnd; index >= 0; index--) {
    const character = text[index]!;
    if (quoted) {
      if (character === "'" && text[index - 1] !== "\\") quoted = false;
      continue;
    }
    if (character === "'") {
      quoted = true;
      continue;
    }
    if (character === ")") depth += 1;
    else if (character === "(") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return 0;
}

function matchingBrace(text: string, open: number): number {
  let depth = 0;
  for (let index = open; index < text.length; index++) {
    const character = text[index]!;
    if (character === "'") {
      index = skipString(text, index) - 1;
      continue;
    }
    if (character === "{") depth += 1;
    else if (character === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return text.length;
}

function openParameterBefore(text: string, offset: number, arrows: readonly ArrowInfo[]): number {
  const stack: number[] = [];
  for (let index = 0; index < offset; index++) {
    const character = text[index]!;
    if (character === "'") {
      index = skipString(text, index) - 1;
      continue;
    }
    if (character === "(") stack.push(index);
    else if (character === ")") stack.pop();
  }
  const open = stack[stack.length - 1];
  if (open === undefined) return -1;
  for (const arrow of arrows) {
    if (arrow.bodyStart !== undefined && arrow.bodyEnd !== undefined) {
      if (open > arrow.bodyStart && open < arrow.bodyEnd) return -1;
    }
  }
  let before = open - 1;
  while (before >= 0 && /\s/.test(text[before]!)) before -= 1;
  if (before >= 0 && text[before] !== "[" && text[before] !== ",") return -1;
  return open;
}
