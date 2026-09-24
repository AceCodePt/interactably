import { defineImplementation } from "@behaviors/_implementation-definition.ts";
import { ImplementationEvent } from "@interactable/implementation-event.ts";
import type { ImplementationEventInit } from "@interactable/implementation-event.ts";
import type { InteractionEvent } from "@interactable/interaction-event.ts";

type Policy = "latest" | "first" | "all";

export const requestable = defineImplementation(
  "requestable",
  {
    events: {
      response: { fields: { html: "string", status: "number" }, open: true },
      "request-error": { fields: { status: "number" }, open: true },
      "request-timeout": {},
      "request-offline": {},
    },
    config: {
      url: "string | undefined",
      method: "'get' | 'post' | 'put' | 'delete' | 'patch' | undefined",
      include: "string | undefined",
      concurrency: "'latest' | 'first' | 'all' | undefined",
      timeout: "number | undefined",
    },
    state: { status: "'loading' | 'error' | undefined" },
    verbs: {
      send: {
        method: "'get' | 'post' | 'put' | 'delete' | 'patch' | undefined",
        url: "string | undefined",
      },
      abort: "undefined",
    },
  },
  (el, attrs) => {
    const inflight = new Set<AbortController>();
    const timeoutTimers = new WeakMap<AbortController, ReturnType<typeof setTimeout>>();
    let latest: AbortController | undefined;

    const policy = (method: string): Policy =>
      attrs.concurrency ?? (method === "get" ? "latest" : "first");

    const clearTimeoutTimer = (controller: AbortController): void => {
      const timer = timeoutTimers.get(controller);
      if (timer === undefined) return;
      clearTimeout(timer);
      timeoutTimers.delete(controller);
    };

    const finish = (controller: AbortController, failed: boolean): void => {
      if (!inflight.delete(controller)) return;
      clearTimeoutTimer(controller);
      if (inflight.size > 0) return;
      attrs.status = failed ? "error" : undefined;
      el.removeAttribute("aria-busy");
    };

    const armTimeout = (controller: AbortController, ms: number | undefined): void => {
      if (ms === undefined) return;
      const timer = setTimeout(() => {
        timeoutTimers.delete(controller);
        controller.abort(timeoutError());
      }, ms);
      timeoutTimers.set(controller, timer);
    };

    const dispatch = (e: InteractionEvent, type: string, values?: Record<string, string>): void => {
      if (!el.isConnected) return;
      const init: ImplementationEventInit = { originalEvent: e.originalEvent };
      if (values !== undefined) init.values = values;
      el.dispatchEvent(new ImplementationEvent(type, init));
    };

    return {
      abort: () => {
        if (inflight.size === 0) return;
        for (const controller of inflight) {
          clearTimeoutTimer(controller);
          controller.abort();
        }
        inflight.clear();
        attrs.status = undefined;
        el.removeAttribute("aria-busy");
      },
      send: (e, opts) => {
        const method = (opts?.method ?? attrs.method ?? "get").toLowerCase();
        const current = policy(method);
        const timeout = attrs.timeout;
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
        armTimeout(controller, timeout);

        const request = buildRequest(el, method, opts?.url ?? attrs.url, attrs.include, controller.signal);
        fetch(request.url, request.init)
          .then(async (response) => {
            if (current === "latest" && controller !== latest) {
              finish(controller, false);
              return;
            }
            if (!response.ok) {
              finish(controller, true);
              dispatch(e, "request-error", { status: String(response.status) });
              return;
            }
            const html = await response.text();
            finish(controller, false);
            dispatch(e, "response", { html, status: String(response.status) });
          })
          .catch((err: unknown) => {
            if (isAbort(err)) {
              finish(controller, false);
              return;
            }
            if (isTimeout(err)) {
              finish(controller, true);
              dispatch(e, "request-timeout");
              return;
            }
            if (current === "latest" && controller !== latest) {
              finish(controller, false);
              return;
            }
            finish(controller, true);
            dispatch(e, "request-offline");
          });
      },
    };
  },
);

function timeoutError(): Error {
  return new DOMException("request timed out", "TimeoutError");
}

function isAbort(err: unknown): boolean {
  return isNamedError(err, "AbortError");
}

function isTimeout(err: unknown): boolean {
  return isNamedError(err, "TimeoutError");
}

function isNamedError(err: unknown, name: string): boolean {
  return typeof err === "object" && err !== null && (err as { name?: unknown }).name === name;
}

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
  if (method === "get") {
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
      if (node instanceof HTMLFormElement) {
        for (const [name, value] of new FormData(node)) fields.push([name, value]);
      } else if (node instanceof HTMLInputElement) {
        collectInputField(node, fields);
      } else if (node instanceof HTMLSelectElement) {
        if (node.disabled || node.name === "") continue;
        for (const option of node.selectedOptions) fields.push([node.name, option.value]);
      } else if (node instanceof HTMLTextAreaElement) {
        if (node.disabled || node.name === "") continue;
        fields.push([node.name, node.value]);
      }
    }
  }
  return fields;
}

function collectInputField(node: HTMLInputElement, fields: Array<[string, FormDataEntryValue]>): void {
  if (node.disabled || node.name === "") return;
  const type = node.type;
  if (type === "checkbox" || type === "radio") {
    if (node.checked) fields.push([node.name, node.value]);
    return;
  }
  if (type === "file") {
    if (node.files !== null) {
      for (const file of node.files) fields.push([node.name, file]);
    }
    return;
  }
  if (type === "submit" || type === "button" || type === "reset" || type === "image") return;
  fields.push([node.name, node.value]);
}
