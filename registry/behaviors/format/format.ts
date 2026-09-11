import { defineImplementation } from "../_implementation-definition.ts";
import { valueOf, writeValue } from "../implementation-utils.ts";

type Kind = "currency" | "number" | "percent" | "date";

export const format = defineImplementation<
  undefined,
  {
    type: "'currency' | 'number' | 'percent' | 'date'";
    strategy: "'blur' | 'live' | undefined";
    locale: "string | undefined";
    currency: "string | undefined";
    "date-style": "'full' | 'long' | 'medium' | 'short' | undefined";
    "min-fraction-digits": "number | undefined";
    "max-fraction-digits": "number | undefined";
    notation: "'standard' | 'compact' | 'scientific' | 'engineering' | undefined";
  },
  {},
  { format: "'currency' | 'number' | 'percent' | 'date'" }
>(
  "format",
  {
    config: {
      type: "'currency' | 'number' | 'percent' | 'date'",
      strategy: "'blur' | 'live' | undefined",
      locale: "string | undefined",
      currency: "string | undefined",
      "date-style": "'full' | 'long' | 'medium' | 'short' | undefined",
      "min-fraction-digits": "number | undefined",
      "max-fraction-digits": "number | undefined",
      notation: "'standard' | 'compact' | 'scientific' | 'engineering' | undefined",
    },
    verbs: { format: "'currency' | 'number' | 'percent' | 'date'" },
  },
  (el, attrs) => {
    const numberOptions = (kind: Exclude<Kind, "date">): Intl.NumberFormatOptions => {
      const options: Intl.NumberFormatOptions = {
        style: kind === "currency" ? "currency" : kind === "percent" ? "percent" : "decimal",
        currency: attrs.currency ?? "USD",
      };
      if (attrs.notation !== undefined) options.notation = attrs.notation;
      if (attrs["min-fraction-digits"] !== undefined) options.minimumFractionDigits = attrs["min-fraction-digits"];
      if (attrs["max-fraction-digits"] !== undefined) options.maximumFractionDigits = attrs["max-fraction-digits"];
      return options;
    };
    const render = (kind: Kind): void => {
      const raw = "value" in el ? (el as { value: string }).value : (el.textContent ?? "");
      const locale = attrs.locale ?? "en-US";
      if (kind === "date") {
        const date = new Date(raw);
        const formatted = Number.isNaN(date.getTime())
          ? raw
          : new Intl.DateTimeFormat(locale, { dateStyle: attrs["date-style"] ?? "medium" }).format(date);
        writeValue(el, formatted);
        el.dataset["value"] = raw;
        return;
      }
      const number = valueOf(el);
      const formatted = new Intl.NumberFormat(locale, numberOptions(kind)).format(
        kind === "percent" ? number / 100 : number,
      );
      writeValue(el, formatted);
      el.dataset["value"] = String(number);
    };
    return { format: (_e, kind) => render(kind) };
  },
);