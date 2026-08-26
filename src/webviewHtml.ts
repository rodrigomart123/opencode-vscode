import * as vscode from "vscode";
import { storagePreload, themePreload } from "./preloadScripts";

function createNonce() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let value = "";
  for (let index = 0; index < 32; index += 1) {
    value += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return value;
}

export function getWebviewHtml(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  config: {
    serverUrl: string;
    version: string;
    workspaceDirectory: string | null;
    colorScheme: "light" | "dark";
    disableHealthCheck: boolean;
    settingsMode?: boolean;
    sharedStorage?: Record<string, string>;
    nativeSettings?: Record<string, unknown>;
  },
) {
  const nonce = createNonce();
  const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "media", "app", "app.js"));
  const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "media", "app", "app.css"));
  const inlineCodeStyle = `<style nonce="${nonce}">
    [data-component="markdown"] :not(pre) > code {
      font-size: 13px;
      padding: 2px 4px;
      margin: 0 1.5px;
      border-radius: 2px;
      background: var(--surface-base);
      box-shadow: 0 0 0 0.5px var(--border-weak-base);
    }
  </style>`;

  const settingsBootStyle = config.settingsMode
    ? `<style nonce="${nonce}">
    #root[data-settings-ready="false"] {
      opacity: 0;
    }

    #root[data-settings-ready="true"] {
      opacity: 1;
    }

    [data-tauri-drag-region],
    [data-component="sidebar-nav-desktop"],
    [data-component="sidebar-nav-mobile"],
    [data-component="sidebar-rail"] {
      display: none !important;
    }

    [data-component="dialog-overlay"] {
      display: none !important;
      pointer-events: none !important;
    }

    [data-component="dialog"][data-transition] [data-slot="dialog-content"] {
      animation: none !important;
      transition: none !important;
    }
  </style>`
    : "";

  return `<!DOCTYPE html>
<html lang="en" style="background-color: var(--background-base)">
  <head>
    <meta charset="UTF-8" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'none'; img-src ${webview.cspSource} https: data: blob:; font-src ${webview.cspSource} data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'nonce-${nonce}'; connect-src ${webview.cspSource} http: https: ws: wss:; worker-src ${webview.cspSource} blob:;"
    />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link href="${styleUri}" rel="stylesheet" />
    ${inlineCodeStyle}
    ${settingsBootStyle}
    <script nonce="${nonce}">window.__OPENCODE_VSCODE_CONFIG__ = ${JSON.stringify(config)};</script>
    <script nonce="${nonce}">${storagePreload}</script>
    <script nonce="${nonce}">${themePreload}</script>
    <title>OpenCode</title>
  </head>
  <body class="antialiased overscroll-none text-12-regular overflow-hidden">
    <div id="root" class="flex flex-col h-dvh p-px"></div>
    <script type="module" src="${scriptUri}"></script>
  </body>
</html>`;
}
