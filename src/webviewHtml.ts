import * as vscode from "vscode";

function createNonce() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let value = "";
  for (let index = 0; index < 32; index += 1) {
    value += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return value;
}

const themePreload = `;(function () {
  var key = "opencode-theme-id"
  var themeId = localStorage.getItem(key) || "oc-2"

  var cfg = window.__OPENCODE_VSCODE_CONFIG__
  var hostScheme = cfg && (cfg.colorScheme === "dark" || cfg.colorScheme === "light") ? cfg.colorScheme : null
  if (hostScheme) {
    localStorage.setItem("opencode-color-scheme", hostScheme)
  }

  if (themeId === "oc-1") {
    themeId = "oc-2"
    localStorage.setItem(key, themeId)
    localStorage.removeItem("opencode-theme-css-light")
    localStorage.removeItem("opencode-theme-css-dark")
  }

  var scheme = hostScheme || localStorage.getItem("opencode-color-scheme") || "system"
  var isDark = scheme === "dark" || (scheme === "system" && matchMedia("(prefers-color-scheme: dark)").matches)
  var mode = isDark ? "dark" : "light"

  document.documentElement.dataset.theme = themeId
  document.documentElement.dataset.colorScheme = mode

  if (themeId === "oc-2") return

  var css = localStorage.getItem("opencode-theme-css-" + mode)
  if (css) {
    var style = document.createElement("style")
    style.id = "oc-theme-preload"
    style.textContent =
      ":root{color-scheme:" +
      mode +
      ";--text-mix-blend-mode:" +
      (isDark ? "plus-lighter" : "multiply") +
      ";" +
      css +
      "}"
    document.head.appendChild(style)
  }
})()`;

export function getWebviewHtml(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  config: {
    serverUrl: string;
    version: string;
    workspaceDirectory: string | null;
    colorScheme: "light" | "dark";
  },
) {
  const nonce = createNonce();
  const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "media", "app", "app.js"));
  const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "media", "app", "app.css"));

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
    <script nonce="${nonce}">window.__OPENCODE_VSCODE_CONFIG__ = ${JSON.stringify(config)};</script>
    <script nonce="${nonce}">${themePreload}</script>
    <title>OpenCode</title>
  </head>
  <body class="antialiased overscroll-none text-12-regular overflow-hidden">
    <div id="root" class="flex flex-col h-dvh p-px"></div>
    <script type="module" src="${scriptUri}"></script>
  </body>
</html>`;
}
