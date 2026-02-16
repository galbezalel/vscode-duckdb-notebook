import * as path from "path";
import * as vscode from "vscode";


class DataDocument implements vscode.CustomDocument {
  constructor(public readonly uri: vscode.Uri) { }
  dispose(): void {
    // Nothing to clean up for now.
  }

  static async create(uri: vscode.Uri): Promise<DataDocument> {
    return new DataDocument(uri);
  }
}

class DuckDBViewerProvider
  implements vscode.CustomReadonlyEditorProvider<DataDocument> {
  public static register(context: vscode.ExtensionContext): vscode.Disposable {
    const provider = new DuckDBViewerProvider(context);
    const retainContextWhenHidden = true;

    const csv = vscode.window.registerCustomEditorProvider(
      "duckdb.csvViewer",
      provider,
      {
        webviewOptions: {
          retainContextWhenHidden,
        },
        supportsMultipleEditorsPerDocument: false,
      },
    );

    const parquet = vscode.window.registerCustomEditorProvider(
      "duckdb.parquetViewer",
      provider,
      {
        webviewOptions: {
          retainContextWhenHidden,
        },
        supportsMultipleEditorsPerDocument: false,
      },
    );



    return vscode.Disposable.from(csv, parquet);
  }

  private readonly extensionUri: vscode.Uri;
  private _fileWriteQueue: Promise<void> = Promise.resolve();

  constructor(private readonly context: vscode.ExtensionContext) {
    this.extensionUri = context.extensionUri;
  }

  async openCustomDocument(
    uri: vscode.Uri,
    _openContext: vscode.CustomDocumentOpenContext,
    _token: vscode.CancellationToken,
  ): Promise<DataDocument> {
    return DataDocument.create(uri);
  }

  private resolveTargetUri(name: string, documentUri: vscode.Uri): vscode.Uri {
    if (path.isAbsolute(name)) {
      return vscode.Uri.file(name);
    }
    if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
      return vscode.Uri.joinPath(vscode.workspace.workspaceFolders[0].uri, name);
    }
    return vscode.Uri.file(path.join(path.dirname(documentUri.fsPath), name));
  }

  async resolveCustomEditor(
    document: DataDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken,
  ): Promise<void> {
    const webview = webviewPanel.webview;
    webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.extensionUri, "out"),
        vscode.Uri.joinPath(this.extensionUri, "media"),
      ],
    };

    webview.html = this.getHtml(webview);

    const pushDataToWebview = async () => {
      try {
        const fileExtension = path.extname(document.uri.fsPath).toLowerCase();
        const raw = await vscode.workspace.fs.readFile(document.uri);
        const fileName = path.basename(document.uri.fsPath, fileExtension).replace(/\s+/g, '_');
        const filePath = document.uri.fsPath;

        // Create a standalone buffer for transfer
        const buffer = raw.buffer.slice(
          raw.byteOffset,
          raw.byteOffset + raw.byteLength,
        );

        // Get initial config
        const config = vscode.workspace.getConfiguration("duckdb");
        const allowExternalFileAccess = config.get<boolean>("allowExternalFileAccess") ?? false;

        webview.postMessage({
          type: "loadData",
          fileName,
          filePath,
          extension: fileExtension,
          data: buffer,
          config: {
            allowExternalFileAccess
          }
        });

      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to read file content.";
        vscode.window.showErrorMessage(message);
      }
    };

    webview.onDidReceiveMessage(async (message) => {
      switch (message.type) {
        case "ready":
          await pushDataToWebview();
          break;
        case "requestRefresh":
          await pushDataToWebview();
          break;
        case "updateConfiguration":
          try {
            const { key, value } = message;
            const config = vscode.workspace.getConfiguration("duckdb");
            await config.update(key, value, vscode.ConfigurationTarget.Global);
            // Also update workspace if it exists and overrides global? 
            // For simplicity, we just set Global as that's what "Remember my choice" does. 
            // If user wants workspace specific, they can use VS Code settings UI.
          } catch (err) {
            vscode.window.showErrorMessage(`Failed to update setting: ${err}`);
          }
          break;
        case "copyToClipboard":
          if (typeof message.value === "string") {
            await vscode.env.clipboard.writeText(message.value);
            vscode.window.showInformationMessage("Copied results to clipboard.");
          }
          break;
        case "exportData":
          try {
            const { data, format, defaultName } = message;
            // data is an ArrayBuffer or Uint8Array
            const buffer = new Uint8Array(data);

            const uri = await vscode.window.showSaveDialog({
              defaultUri: vscode.Uri.joinPath(document.uri, '..', defaultName),
              filters: {
                [format === 'csv' ? 'CSV' : 'Parquet']: [format]
              }
            });

            if (uri) {
              await vscode.workspace.fs.writeFile(uri, buffer);
              vscode.window.showInformationMessage(`Successfully exported to ${path.basename(uri.fsPath)}`);
            }
          } catch (err) {
            vscode.window.showErrorMessage(`Export failed: ${err instanceof Error ? err.message : String(err)}`);
          }
          break;
        case "saveFileStart":
          this._fileWriteQueue = this._fileWriteQueue.then(async () => {
            try {
              const { name } = message;
              const targetUri = this.resolveTargetUri(name, document.uri);
              console.log(`[DuckDB] saveFileStart: ${name} -> ${targetUri.fsPath}`);
              // Create/overwrite with empty content
              await vscode.workspace.fs.writeFile(targetUri, new Uint8Array(0));
            } catch (err) {
              vscode.window.showErrorMessage(`Failed to start saving file: ${err instanceof Error ? err.message : String(err)}`);
            }
          });
          break;

        case "saveFileChunk":
          this._fileWriteQueue = this._fileWriteQueue.then(async () => {
            try {
              const { name, data } = message;
              const buffer = new Uint8Array(data);
              const targetUri = this.resolveTargetUri(name, document.uri);
              console.log(`[DuckDB] saveFileChunk: ${name}, size=${buffer.length}`);

              // Read existing, append, write back.
              // Note: vscode.fs doesn't support appendStream easily for webviews/remote, 
              // but for local files this is less efficient than Node's fs.appendFile. 
              // However, to keep it generic for VS Code FS API (which might be remote):
              // We'll read the file, concat, and write. 
              // Wait, reading 50MB to append 1MB is bad.
              // Optimization: If scheme is file, use fs.appendFile directly if possible? 
              // extensionHost runs in Node.
              // Let's use standard fs for local files if possible, or VS Code API with read-modify-write as fallback.
              // Actually, for simplicity and safety across remote:
              // Regrettably, VS Code API has no append.
              // But we can use workspace.fs.readFile, then concat. 
              // Correct approach for large files in VS Code API: likely not optimal.
              // But if we are in a local workspace, we can use `fs`.

              if (targetUri.scheme === 'file') {
                const fs = require('fs');
                fs.appendFileSync(targetUri.fsPath, buffer);
              } else {
                // Fallback for remote/virtual filesystems (slow but correct)
                const existing = await vscode.workspace.fs.readFile(targetUri);
                const newBuffer = new Uint8Array(existing.length + buffer.length);
                newBuffer.set(existing);
                newBuffer.set(buffer, existing.length);
                await vscode.workspace.fs.writeFile(targetUri, newBuffer);
              }
            } catch (err) {
              console.error(err);
              // Silent fail for chunks to avoid spam, or log to output channel
            }
          });
          break;

        case "saveFileEnd":
          this._fileWriteQueue = this._fileWriteQueue.then(async () => {
            const { name } = message;
            vscode.window.showInformationMessage(`Saved ${name} to project root.`);
          });
          break;
        case "openUrl":
          if (message.url) {
            vscode.env.openExternal(vscode.Uri.parse(message.url));
          }
          break;
        case "requestFileAccess":
          try {
            const { filePath } = message;
            const config = vscode.workspace.getConfiguration("duckdb");
            const allowExternal = config.get<boolean>("allowExternalFileAccess");

            if (allowExternal) {
              // Allowed by setting
              const fileUri = vscode.Uri.file(filePath);
              const data = await vscode.workspace.fs.readFile(fileUri);
              webview.postMessage({
                type: "fileAccessGranted",
                filePath,
                data: new Uint8Array(data)
              });
              return;
            }

            // Not allowed yet, ask user
            const selection = await vscode.window.showWarningMessage(
              `DuckDB wants to read an external file: ${filePath}. Allow this?`,
              "Allow",
              "Allow and Remember",
              "Deny"
            );

            if (selection === "Allow") {
              const fileUri = vscode.Uri.file(filePath);
              const data = await vscode.workspace.fs.readFile(fileUri);
              webview.postMessage({
                type: "fileAccessGranted",
                filePath,
                data: new Uint8Array(data)
              });
            } else if (selection === "Allow and Remember") {
              await config.update("allowExternalFileAccess", true, vscode.ConfigurationTarget.Global);
              const fileUri = vscode.Uri.file(filePath);
              const data = await vscode.workspace.fs.readFile(fileUri);
              webview.postMessage({
                type: "fileAccessGranted",
                filePath,
                data: new Uint8Array(data)
              });
            } else {
              webview.postMessage({
                type: "fileAccessDenied",
                filePath,
                error: "User denied access"
              });
            }
          } catch (err) {
            webview.postMessage({
              type: "fileAccessDenied",
              filePath: message.filePath,
              error: err instanceof Error ? err.message : String(err)
            });
          }
          break;
        default:
          break;
      }
    });
  }

  private getHtml(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "out", "webview.js"),
    );
    const stylesUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "media", "styles.css"),
    );
    const duckdbWorkerUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "out", "duckdb-browser-eh.worker.js"),
    );
    const duckdbWasmUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "out", "duckdb-eh.wasm"),
    );
    const nonce = this.getNonce();
    const csp = [
      "default-src 'none'",
      `img-src ${webview.cspSource} data:`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `script-src ${webview.cspSource} 'nonce-${nonce}' 'wasm-unsafe-eval'`,
      `connect-src ${webview.cspSource}`,
      `worker-src ${webview.cspSource} blob:`,
      "frame-src 'none'",
    ].join("; ");

    return /* html */ `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="${csp}" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link href="${stylesUri}" rel="stylesheet" nonce="${nonce}" />
    <title>DuckDB Viewer</title>
  </head>
  <body>
    <div id="root"></div>
    <script nonce="${nonce}">
      window.__duckdbPaths = {
        worker: "${duckdbWorkerUri}",
        wasm: "${duckdbWasmUri}"
      };
    </script>
    <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
  </body>
</html>`;
  }

  private getNonce(): string {
    const possible =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let nonce = "";
    for (let i = 0; i < 32; i++) {
      nonce += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return nonce;
  }
}

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(DuckDBViewerProvider.register(context));
}

export function deactivate(): void {
  // Nothing to do here.
}
