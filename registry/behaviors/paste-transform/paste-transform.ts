import { defineImplementation } from "@behaviors/_implementation-definition.ts";

export const pasteTransform = defineImplementation("paste-transform", {
  tags: ["input", "textarea"],
  config: {
    pattern: "string | undefined",
    replace: "string | undefined",
  },
  verbs: {},
}, (el, attrs) => {
  const loggedInvalid: Set<string> = new Set();
  return {
    onPaste: (event: Event) => {
      const clipboard = (event as ClipboardEvent).clipboardData;
      if (!clipboard) return;
      const pasted = clipboard.getData("text");
      if (pasted === "") return;
      const pattern = attrs.pattern;
      const replace = attrs.replace;
      if (pattern === undefined || replace === undefined) return;

      let regex: RegExp;
      try {
        regex = new RegExp(pattern, "g");
      } catch {
        if (!loggedInvalid.has(pattern)) {
          loggedInvalid.add(pattern);
          console.error(`[Interactable] paste-transform invalid regex: ${pattern}`);
        }
        return;
      }

      const transformed = pasted.replace(regex, replace);
      if (transformed === pasted) return;
      event.preventDefault();
      const start = el.selectionStart ?? el.value.length;
      const end = el.selectionEnd ?? el.value.length;
      el.setRangeText(transformed, start, end, "end");
      el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertFromPaste", data: transformed }));
    },
  };
});