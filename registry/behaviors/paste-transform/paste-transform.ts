import { defineImplementation } from "../_implementation-definition.ts";

export const pasteTransform = defineImplementation("paste-transform", {
  tags: ["input", "textarea"],
  config: {
    patterns: "string | undefined",
    replaces: "string | undefined",
  },
  verbs: {},
}, (el, attrs) => ({
  onPaste: (event: Event) => {
    const clipboard = (event as ClipboardEvent).clipboardData;
    if (!clipboard) return;
    const pasted = clipboard.getData("text");
    if (pasted === "") return;
    const patterns = attrs.patterns;
    const replaces = attrs.replaces;
    if (patterns === undefined || replaces === undefined) return;

    let transformed = pasted;
    let changed = false;
    patterns.split(",").forEach((pattern, index) => {
      const replacement = replaces.split(",")[index] ?? "";
      try {
        const next = transformed.replace(new RegExp(pattern, "g"), replacement);
        if (next !== transformed) {
          transformed = next;
          changed = true;
        }
      } catch {
        console.error(`[Interactable] paste-transform invalid regex: ${pattern}`);
      }
    });

    if (!changed) return;
    event.preventDefault();
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    el.setRangeText(transformed, start, end, "end");
    el.dispatchEvent(new Event("change", { bubbles: true }));
  },
}));