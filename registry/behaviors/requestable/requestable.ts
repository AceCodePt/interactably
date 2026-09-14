import { defineImplementation } from "@behaviors/_implementation-definition.ts";
import { runPhrases } from "@interactable/executor.ts";

type Policy = "latest" | "first" | "all";

export const requestable = defineImplementation(
  "requestable",
  {
    config: {
      url: "string | undefined",
      method: "'get' | 'post' | 'put' | 'delete' | 'patch' | undefined",
      target: "string | undefined",
      swap:
        "'innerHTML' | 'outerHTML' | 'beforebegin' | 'afterbegin' | 'beforeend' | 'afterend' | 'delete' | 'none' | undefined",
      include: "string | undefined",
      concurrency: "'latest' | 'first' | 'all' | undefined",
      after: "string | undefined",
      error: "string | undefined",
    },
    state: { status: "'idle' | 'loading' | 'error' | undefined" },
    verbs: { send: "undefined", abort: "undefined" },
  },
  (el, attrs) => {
    let inflight: AbortController | undefined;

    const policy = (method: string): Policy =>
      attrs.concurrency ?? (method === "get" ? "latest" : "first");

    const settle = (status?: "error"): void => {
      inflight = undefined;
      attrs.status = status;
      el.removeAttribute("aria-busy");
    };

    return {
      abort: () => {
        inflight?.abort();
        settle();
      },
      send: (e) => {
        const method = (attrs.method ?? "get").toLowerCase();
        const current = policy(method);
        if (inflight !== undefined) {
          if (current === "first") return;
          if (current === "latest") inflight.abort();
        }
        const controller = new AbortController();
        inflight = controller;
        attrs.status = "loading";
        el.setAttribute("aria-busy", "true");

        const request = buildRequest(el, method, attrs.url, attrs.include, controller.signal);
        fetch(request.url, request.init)
          .then(async (response) => {
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const html = await response.text();
            if (controller !== inflight) return;
            applySwap(el, attrs.swap, attrs.target, html);
            settle();
            if (attrs.after !== undefined && el.isConnected) {
              runPhrases(el, attrs.after, e.originalEvent);
            }
          })
          .catch((err: unknown) => {
            if (isAbort(err)) return;
            if (controller !== inflight) return;
            settle("error");
            if (attrs.error !== undefined && el.isConnected) {
              runPhrases(el, attrs.error, e.originalEvent);
            }
          });
      },
    };
  },
);

function buildRequest(
  el: HTMLElement,
  method: string,
  configuredUrl: string | undefined,
  include: string | undefined,
  signal: AbortSignal,
): { url: string; init: RequestInit } {
  let url = resolveUrl(el, configuredUrl);
  const init: RequestInit = { method: method.toUpperCase(), signal };
  const fields = collectFields(el, include);
  if (method === "get" || method === "head") {
    const params = new URLSearchParams();
    for (const [name, value] of fields) params.append(name, typeof value === "string" ? value : value.name);
    const query = params.toString();
    if (query !== "") url += (url.includes("?") ? "&" : "?") + query;
  } else {
    const body = new FormData();
    for (const [name, value] of fields) body.append(name, value);
    init.body = body;
  }
  return { url, init };
}

function resolveUrl(el: HTMLElement, configured: string | undefined): string {
  if (configured !== undefined) return configured;
  if (el instanceof HTMLFormElement) return el.action;
  return el.getAttribute("href") ?? "";
}

function collectFields(el: HTMLElement, include: string | undefined): Array<[string, FormDataEntryValue]> {
  const fields: Array<[string, FormDataEntryValue]> = [];
  if (el instanceof HTMLFormElement) {
    for (const [name, value] of new FormData(el)) fields.push([name, value]);
  }
  if (include !== undefined) {
    for (const node of document.querySelectorAll(include)) {
      if (node instanceof HTMLInputElement || node instanceof HTMLSelectElement || node instanceof HTMLTextAreaElement) {
        if (node.name !== "") fields.push([node.name, node.value]);
      }
    }
  }
  return fields;
}

function applySwap(
  el: HTMLElement,
  swap: string | undefined,
  target: string | undefined,
  html: string,
): void {
  const mode = swap ?? "innerHTML";
  if (mode === "none") return;
  const destination = resolveTarget(el, target);
  if (destination === null) {
    console.error(`[Interactable] requestable target "${target ?? ""}" not found; response dropped`);
    return;
  }
  switch (mode) {
    case "delete":
      destination.remove();
      return;
    case "innerHTML":
      (destination as HTMLElement).innerHTML = html;
      return;
    case "outerHTML":
      (destination as HTMLElement).outerHTML = html;
      return;
    case "beforebegin":
    case "afterbegin":
    case "beforeend":
    case "afterend":
      destination.insertAdjacentHTML(mode, html);
      return;
  }
}

function resolveTarget(el: HTMLElement, target: string | undefined): Element | null {
  if (target === undefined) return el;
  return document.querySelector(target);
}

function isAbort(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { name?: unknown }).name === "AbortError";
}
