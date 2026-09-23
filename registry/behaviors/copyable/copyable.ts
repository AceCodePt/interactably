import { defineImplementation } from "@behaviors/_implementation-definition.ts";
import { ImplementationEvent } from "@interactable/implementation-event.ts";

export const copyable = defineImplementation(
  "copyable",
  {
    tags: ["pre", "code", "p", "div"],
    events: ["copy-error"],
    verbs: { copy: "undefined" },
  },
  (el) => ({
    copy: () => {
      const text = el.textContent ?? "";
      if (text.trim() === "") return;
      void copyText(text).then((ok) => {
        if (!el.isConnected) return;
        el.dispatchEvent(ok ? new Event("copy") : new ImplementationEvent("copy-error"));
      });
    },
  }),
);

function copyText(text: string): Promise<boolean> {
  const clipboard = navigator.clipboard;
  if (clipboard !== undefined) {
    return clipboard.writeText(text).then(
      () => true,
      () => legacyCopy(text),
    );
  }
  return Promise.resolve(legacyCopy(text));
}

function legacyCopy(text: string): boolean {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  textarea.remove();
  return ok;
}