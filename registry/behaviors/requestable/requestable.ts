import { defineImplementation } from "@behaviors/_implementation-definition.ts";
import { ImplementationEvent } from "@interactable/implementation-event.ts";

type Policy = "latest" | "first" | "all";

export const requestable = defineImplementation(
  "requestable",
  {
    events: ["response", "request-error"],
    config: {
      url: "string | undefined",
      method: "'get' | 'post' | 'put' | 'delete' | 'patch' | undefined",
      target: "string | undefined",
      swap:
        "'innerHTML' | 'outerHTML' | 'beforebegin' | 'afterbegin' | 'beforeend' | 'afterend' | 'delete' | 'none' | undefined",
      include: "string | undefined",
      concurrency: "'latest' | 'first' | 'all' | undefined",
    },
    state: { status: "'idle' | 'loading' | 'error' | undefined" },
    verbs: {
      send: {
        method: "'get' | 'post' | 'put' | 'patch' | 'delete' | undefined",
        url: "string | undefined",
      },
      abort: "undefined",
    },
  },
  (el, attrs) => {
    const inflight = new Set<AbortController>();
    let latest: AbortController | undefined;

    const policy = (method: string): Policy =>
      attrs.concurrency ?? (method === "get" ? "latest" : "first");

    const finish = (controller: AbortController, failed: boolean): void => {
      if (!inflight.delete(controller)) return;
      if (inflight.size > 0) return;
      attrs.status = failed ? "error" : undefined;
      el.removeAttribute("aria-busy");
    };

    return {
      abort: () => {
        if (inflight.size === 0) return;
        for (const controller of inflight) controller.abort();
        inflight.clear();
        attrs.status = undefined;
        el.removeAttribute("aria-busy");
      },
      send: (e, opts) => {
        const method = (opts?.method ?? attrs.method ?? "get").toLowerCase();
        const current = policy(method);
        if (inflight.size > 0) {
          if (current === "first") return;
          if (current === "latest") {
            for (const controller of inflight) controller.abort();
          }
        }
        const controller = new AbortController();
        inflight.add(controller);
        if (current === "latest") latest = controller;
        attrs.status = "loading";
        el.setAttribute("aria-busy", "true");

        const request = buildRequest(el, method, opts?.url ?? attrs.url, attrs.include, controller.signal);
        fetch(request.url, request.init)
          .then(async (response) => {
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const html = await response.text();
            if (current === "latest" && controller !== latest) {
              finish(controller, false);
              return;
            }
            applySwap(el, attrs.swap, attrs.target, html);
            finish(controller, false);
            if (el.isConnected) {
              el.dispatchEvent(new ImplementationEvent("response", { originalEvent: e.originalEvent }));
            }
          })
          .catch((err: unknown) => {
            if (isAbort(err)) {
              finish(controller, false);
              return;
            }
            if (current === "latest" && controller !== latest) {
              finish(controller, false);
              return;
            }
            finish(controller, true);
            if (el.isConnected) {
              el.dispatchEvent(new ImplementationEvent("request-error", { originalEvent: e.originalEvent }));
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
