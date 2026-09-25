import { attach, detach, fireOnLoad, isAttached } from "@interactable/attachment.ts";

export type StartRoot = Document | Element;

const disposers = new WeakMap<object, () => void>();

export function start(root: StartRoot = document): () => void {
  const existing = disposers.get(root);
  if (existing !== undefined) return existing;

  const documentRoot = root.nodeType === 9;

  const pending: Element[] = [];
  let documentReady = document.readyState !== "loading";
  let didInitialScan = false;
  let observing = false;
  let dclScheduled = false;

  const attachBatch = (elements: Iterable<Element>): void => {
    const batch: Element[] = [];
    const seen = new Set<Element>();
    for (const el of elements) {
      if (seen.has(el)) continue;
      seen.add(el);
      if (el.isConnected && !isAttached(el) && isParticipant(el)) batch.push(el);
    }
    if (batch.length === 0) return;
    batch.sort(byDocumentOrder);
    for (const el of batch) attach(el);
    for (const el of batch) fireOnLoad(el);
  };

  const drainPending = (): void => {
    if (pending.length === 0) return;
    const batch = [...pending];
    pending.length = 0;
    attachBatch(batch);
  };

  const ensureDCL = (): void => {
    if (dclScheduled) return;
    dclScheduled = true;
    document.addEventListener(
      "DOMContentLoaded",
      () => {
        dclScheduled = false;
        documentReady = true;
        observeTarget();
        if (!didInitialScan) {
          didInitialScan = true;
          const all = [...collectFromRoot(), ...pending];
          pending.length = 0;
          attachBatch(all);
        } else {
          drainPending();
        }
      },
      { once: true },
    );
  };

  const collectFromRoot = (): Element[] => {
    const out: Element[] = [];
    if (documentRoot) {
      const body = (root as Document).body;
      if (body === null) return out;
      if (isParticipant(body)) out.push(body);
      for (const el of body.querySelectorAll("*")) {
        if (isParticipant(el)) out.push(el);
      }
    } else {
      for (const el of root.querySelectorAll("*")) {
        if (isParticipant(el)) out.push(el);
      }
    }
    return out;
  };

  const observer = new MutationObserver((mutations) => {
    if (!documentReady) {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === 1) collectParticipants(node as Element, pending);
        }
      }
      ensureDCL();
      return;
    }
    const added: Element[] = [];
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType === 1) collectParticipants(node as Element, added);
      }
    }
    attachBatch(added);
    for (const mutation of mutations) {
      for (const node of mutation.removedNodes) {
        if (node.nodeType !== 1) continue;
        walkRemoved(node as Element);
      }
    }
  });

  const observeTarget = (): boolean => {
    if (observing) return true;
    if (documentRoot) {
      const body = (root as Document).body;
      if (body === null) return false;
      observer.observe(body, { childList: true, subtree: true });
    } else {
      observer.observe(root, { childList: true, subtree: true });
    }
    observing = true;
    return true;
  };

  const dispose = (): void => {
    observer.disconnect();
    disposers.delete(root);
  };

  const observingNow = observeTarget();
  if (!documentReady) {
    ensureDCL();
  } else if (observingNow) {
    didInitialScan = true;
    attachBatch(collectFromRoot());
  } else {
    ensureDCL();
  }

  disposers.set(root, dispose);
  return dispose;
}

function isParticipant(el: Element): boolean {
  if (el.hasAttribute("implements")) return true;
  for (const name of el.getAttributeNames()) {
    if (name.startsWith("on-")) return true;
  }
  return false;
}

function collectParticipants(node: Element, into: Element[]): void {
  if (isParticipant(node)) into.push(node);
  for (const child of node.querySelectorAll("*")) {
    if (isParticipant(child)) into.push(child);
  }
}

function walkRemoved(node: Element): void {
  if (isAttached(node) && !node.isConnected) detach(node);
  for (const child of node.querySelectorAll("*")) {
    if (isAttached(child) && !child.isConnected) detach(child);
  }
}

function byDocumentOrder(a: Element, b: Element): number {
  if (a === b) return 0;
  return (a.compareDocumentPosition(b) & 4) !== 0 ? -1 : 1;
}