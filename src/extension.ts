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

        webview.postMessage({
          type: "loadData",
          fileName,
          filePath,
          extension: fileExtension,
          data: buffer
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
              defaultUri: vscode.Uri.file(defaultName),
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
        case "openUrl":
          if (message.url) {
            vscode.env.openExternal(vscode.Uri.parse(message.url));
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
