import * as path from "path";
import * as vscode from "vscode";

class DataDocument implements vscode.CustomDocument {
  constructor(public readonly uri: vscode.Uri) {}
  dispose(): void {
    // Nothing to clean up for now.
  }

  static async create(uri: vscode.Uri): Promise<DataDocument> {
    return new DataDocument(uri);
  }
}

class DuckDBViewerProvider
  implements vscode.CustomReadonlyEditorProvider<DataDocument>
{
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
        vscode.Uri.joinPath(this.extensionUri, "media"),
        this.extensionUri,
      ],
    };

    webview.html = this.getHtml(webview);

    const pushDataToWebview = async () => {
      try {
        const raw = await vscode.workspace.fs.readFile(document.uri);
        const base64 = Buffer.from(raw).toString("base64");
        const fileExtension = path.extname(document.uri.fsPath).replace(".", "");
        webview.postMessage({
          type: "loadData",
          name: path.basename(document.uri.fsPath),
          extension: fileExtension || "csv",
          data: base64,
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
        default:
          break;
      }
    });
  }

  private getHtml(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "media", "main.js"),
    );
    const stylesUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "media", "styles.css"),
    );
    const nonce = this.getNonce();
    const csp = [
      "default-src 'none'",
      `img-src ${webview.cspSource} https:`,
      `style-src ${webview.cspSource} 'nonce-${nonce}'`,
      `script-src 'nonce-${nonce}' https://cdn.jsdelivr.net`,
      "connect-src https://cdn.jsdelivr.net",
      "worker-src https://cdn.jsdelivr.net blob:",
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
    <div class="toolbar">
      <div>
        <strong id="fileName">DuckDB</strong>
        <span id="status" class="status">Ready</span>
      </div>
      <div class="actions">
        <button id="refresh">Reload File</button>
        <button id="run" class="primary">Run (Ctrl/Cmd+Enter)</button>
      </div>
    </div>
    <div class="pane-container">
      <section class="pane editor">
        <textarea id="sql" spellcheck="false"></textarea>
      </section>
      <section class="pane results">
        <div class="results-header">
          <div class="title">Results</div>
          <button id="copy">Copy CSV</button>
        </div>
        <div id="table" class="table"></div>
      </section>
    </div>
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
