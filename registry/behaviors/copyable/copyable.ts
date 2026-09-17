import { defineImplementation } from "@behaviors/_implementation-definition.ts";
import { ImplementationEvent } from "@interactable/implementation-event.ts";

export const copyable = defineImplementation(
  "copyable",
  {
    tags: ["button"],
    events: ["copy"],
    verbs: { copy: HTMLElement },
  },
  (el) => ({
    copy: (e, target) => {
      const text = target.textContent ?? "";
      if (text.trim() === "") {
        console.warn(`[Interactable] copyable: #${target.id} has no text to copy`);
        return;
      }
      void copyText(text).then((ok) => {
        if (ok) {
          if (el.isConnected) {
            el.dispatchEvent(new ImplementationEvent("copy", { originalEvent: e.originalEvent }));
          }
        } else {
          console.warn(`[Interactable] copyable: could not copy #${target.id}`);
        }
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