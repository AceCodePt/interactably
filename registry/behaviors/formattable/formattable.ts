import { defineImplementation } from "@behaviors/_implementation-definition.ts";
import { formatWrite, readValue, registerFormatter, writeValue } from "@behaviors/implementation-utils.ts";
import { formatValue, parseOptions } from "./format.ts";

export const formattable = defineImplementation(
  "formattable",
  {
    tags: ["output", "span", "div", "td", "p", "li", "dd", "b", "strong", "em", "small"],
    config: {
      format: "string",
    },
    verbs: {},
  },
  (el, attrs) => {
    const formatter = (raw: string): string => {
      let source: string;
      try {
        source = attrs.format;
      } catch {
        return raw;
      }
      try {
        return formatValue(raw, parseOptions(source));
      } catch {
        return raw;
      }
    };
    registerFormatter(el, formatter);
    return {
      connectedCallback: () => {
        writeValue(el, formatWrite(el, String(readValue(el))));
      },
    };
  },
);