import { createConnection, DocumentDiagnosticReportKind, TextDocumentSyncKind, TextDocuments } from "vscode-languageserver/node.js";
import { TextDocument } from "vscode-languageserver-textdocument";
import { analyze } from "./analysis.ts";
import { computeCompletions } from "./completion.ts";
import { computeDiagnostics } from "./diagnostics.ts";
import { loadVocabulary } from "./vocabulary.ts";

export function startServer(): void {
  const vocabulary = loadVocabulary();
  const connection = createConnection(process.stdin, process.stdout);
  const documents = new TextDocuments(TextDocument);
  let pullDiagnostics = false;

  connection.onInitialize((params) => {
    pullDiagnostics = params.capabilities.textDocument?.diagnostic !== undefined;
    return {
      capabilities: {
        textDocumentSync: {
          openClose: true,
          change: TextDocumentSyncKind.Full,
        },
        completionProvider: {
          triggerCharacters: ["#", "."],
        },
        diagnosticProvider: {
          interFileDependencies: false,
          workspaceDiagnostics: false,
        },
      },
      serverInfo: {
        name: "interactably-lsp",
        version: "0.1.0",
      },
    };
  });

  connection.onCompletion((params) => {
    const document = documents.get(params.textDocument.uri);
    if (document === undefined) return null;
    const analysis = analyze(document.getText(), vocabulary);
    return computeCompletions(analysis, params.position);
  });

  connection.languages.diagnostics.on((params) => {
    const document = documents.get(params.textDocument.uri);
    const items =
      document === undefined ? [] : computeDiagnostics(analyze(document.getText(), vocabulary));
    return { kind: DocumentDiagnosticReportKind.Full, items };
  });

  const publish = (document: TextDocument): void => {
    if (pullDiagnostics) return;
    const diagnostics = computeDiagnostics(analyze(document.getText(), vocabulary));
    void connection.sendDiagnostics({
      uri: document.uri,
      version: document.version,
      diagnostics,
    });
  };

  documents.onDidOpen((event) => publish(event.document));
  documents.onDidChangeContent((event) => publish(event.document));

  documents.listen(connection);
  connection.listen();
}
