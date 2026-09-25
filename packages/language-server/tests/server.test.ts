import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import type { ChildProcessByStdio } from "node:child_process";
import type { Readable, Writable } from "node:stream";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { siteExample } from "./support.ts";

const binPath = fileURLToPath(new URL("../dist/bin.js", import.meta.url));
const hasBuild = existsSync(binPath);

interface JsonRpcMessage {
  jsonrpc: "2.0";
  id?: number;
  method?: string;
  result?: unknown;
  params?: unknown;
}

class Client {
  private readonly child: ChildProcessByStdio<Writable, Readable, null>;
  private buffer = Buffer.alloc(0);
  private nextId = 1;
  private readonly pending = new Map<number, (message: JsonRpcMessage) => void>();
  private readonly notifications: JsonRpcMessage[] = [];

  constructor() {
    this.child = spawn("node", [binPath], { stdio: ["pipe", "pipe", "inherit"] });
    this.child.stdout.on("data", (chunk: Buffer) => this.onData(chunk));
  }

  private onData(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (true) {
      const headerEnd = this.buffer.indexOf("\r\n\r\n");
      if (headerEnd === -1) return;
      const header = this.buffer.slice(0, headerEnd).toString();
      const match = /Content-Length: (\d+)/i.exec(header);
      if (match === null) return;
      const length = Number(match[1]);
      const start = headerEnd + 4;
      if (this.buffer.length < start + length) return;
      const body = this.buffer.slice(start, start + length).toString();
      this.buffer = this.buffer.slice(start + length);
      const message = JSON.parse(body) as JsonRpcMessage;
      if (message.id !== undefined) {
        this.pending.get(message.id)?.(message);
        this.pending.delete(message.id);
      } else {
        this.notifications.push(message);
      }
    }
  }

  request(method: string, params: unknown): Promise<JsonRpcMessage> {
    const id = this.nextId++;
    const body = JSON.stringify({ jsonrpc: "2.0", id, method, params });
    this.child.stdin.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timeout waiting for ${method}`)), 10_000);
      this.pending.set(id, (message) => {
        clearTimeout(timer);
        resolve(message);
      });
    });
  }

  notify(method: string, params: unknown): void {
    const body = JSON.stringify({ jsonrpc: "2.0", method, params });
    this.child.stdin.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
  }

  kill(): void {
    this.child.kill();
  }
}

test("server: initialize advertises sync, diagnostics and completion", { skip: !hasBuild }, async () => {
  const client = new Client();
  try {
    const response = await client.request("initialize", {
      processId: null,
      rootUri: null,
      capabilities: {},
    });
    const result = response.result as {
      capabilities: {
        textDocumentSync?: unknown;
        completionProvider?: unknown;
        diagnosticProvider?: unknown;
      };
    };
    assert.ok(result.capabilities.textDocumentSync, "textDocumentSync missing");
    assert.ok(result.capabilities.completionProvider, "completionProvider missing");
    assert.ok(result.capabilities.diagnosticProvider, "diagnosticProvider missing");
  } finally {
    client.kill();
  }
});

test("server: todo-list.html produces no diagnostics and completes", { skip: !hasBuild }, async () => {
  const client = new Client();
  try {
    await client.request("initialize", { processId: null, rootUri: null, capabilities: {} });
    client.notify("initialized", {});

    const text = siteExample("todo-list.html");
    const uri = "file:///todo-list.html";
    client.notify("textDocument/didOpen", {
      textDocument: { uri, languageId: "html", version: 1, text },
    });

    const diagnosticResponse = await client.request("textDocument/diagnostic", {
      textDocument: { uri },
    });
    const report = diagnosticResponse.result as { kind: string; items: unknown[] };
    assert.equal(report.kind, "full");
    assert.deepEqual(report.items, []);

    const hashLine = text.slice(0, text.indexOf('on-click="#todo-list') + 'on-click="#'.length).split("\n");
    const line = hashLine.length - 1;
    const character = hashLine[hashLine.length - 1]!.length;
    const completionResponse = await client.request("textDocument/completion", {
      textDocument: { uri },
      position: { line, character },
    });
    const items = completionResponse.result as Array<{ label: string }>;
    assert.ok(items.some((item) => item.label === "todo-list"));
  } finally {
    client.kill();
  }
});
