import { entities } from "vscode-html-languageservice/lib/umd/parser/htmlEntities.js";

export interface DecodedText {
  readonly text: string;
  toRaw(offset: number): number;
}

const MAX_ENTITY_LENGTH = 32;

function entityAt(raw: string, index: number): { text: string; length: number } | null {
  const rest = raw.slice(index + 1, index + 1 + MAX_ENTITY_LENGTH);
  if (rest.startsWith("#")) {
    const match = /^#([0-9]+|[xX][0-9a-fA-F]+);?/.exec(rest);
    if (match === null) return null;
    const digits = match[1]!;
    const code = digits.startsWith("x") || digits.startsWith("X")
      ? Number.parseInt(digits.slice(1), 16)
      : Number.parseInt(digits, 10);
    if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return null;
    return { text: String.fromCodePoint(code), length: 1 + match[0].length };
  }
  const semicolon = rest.indexOf(";");
  if (semicolon !== -1) {
    const key = rest.slice(0, semicolon + 1);
    const value = entities[key];
    if (value !== undefined) return { text: value, length: 1 + key.length };
  }
  for (let length = Math.min(rest.length, MAX_ENTITY_LENGTH); length >= 2; length--) {
    const key = rest.slice(0, length);
    const value = entities[key];
    if (value !== undefined) return { text: value, length: 1 + length };
  }
  return null;
}

export function decodeHtml(raw: string): DecodedText {
  const characters: string[] = [];
  const map: number[] = [];
  let index = 0;
  while (index < raw.length) {
    const character = raw[index]!;
    if (character === "&") {
      const entity = entityAt(raw, index);
      if (entity !== null) {
        for (let unit = 0; unit < entity.text.length; unit++) {
          map.push(index);
          characters.push(entity.text[unit]!);
        }
        index += entity.length;
        continue;
      }
    }
    map.push(index);
    characters.push(character);
    index += 1;
  }
  map.push(raw.length);
  const text = characters.join("");
  return {
    text,
    toRaw(offset: number): number {
      if (offset <= 0) return 0;
      if (offset >= map.length - 1) return raw.length;
      return map[offset] ?? raw.length;
    },
  };
}
