import * as vscode from "vscode";
import { OpenCodeService } from "./opencodeService";
import { OpenCodeSidebarProvider } from "./sidebarProvider";

export async function activate(context: vscode.ExtensionContext) {
  const service = new OpenCodeService(context);
  const provider = new OpenCodeSidebarProvider(context, service);

  const syncWorkspace = (reloadOnChange: boolean) => {
    void service
      .syncWorkspaceContext()
      .then(async (changed) => {
        if (!reloadOnChange || !changed) {
          return;
        }
        await provider.reload();
      })
      .catch(() => {
        // State errors are surfaced by the sidebar connection state.
      });
  };

  context.subscriptions.push(service, provider);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(OpenCodeSidebarProvider.viewId, provider, {
      webviewOptions: {
        retainContextWhenHidden: true,
      },
    }),
  );

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(() => {
      syncWorkspace(false);
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      syncWorkspace(true);
    }),
    vscode.window.onDidChangeVisibleTextEditors(() => {
      syncWorkspace(false);
    }),
    vscode.window.onDidChangeActiveColorTheme(() => {
      provider.notifyTheme();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("opencodeVisual.focus", async () => {
      await provider.reveal();
    }),
    vscode.commands.registerCommand("opencodeVisual.newSession", async () => {
      await provider.reveal();
      provider.dispatchAction("newSession");
    }),
    vscode.commands.registerCommand("opencodeVisual.refresh", async () => {
      await provider.reload();
      await provider.reveal();
    }),
    vscode.commands.registerCommand("opencodeVisual.openSettings", async () => {
      await vscode.commands.executeCommand(
        "workbench.action.openSettings",
        "@ext:rodrigomart123.opencode-for-vscode opencodeVisual",
      );
    }),
    vscode.commands.registerCommand("opencodeVisual.restartServer", async () => {
      await service.ensureServerReady(true);
      await provider.reload();
      await provider.reveal();
    }),
  );

  void service.ensureServerReady().catch(() => {
    // The webview will surface connection failures against the configured server.
  });
}

export function deactivate() {
  // VS Code disposes subscriptions registered during activation.
}
