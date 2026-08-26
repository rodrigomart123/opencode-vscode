import * as vscode from "vscode";
import { OpenCodeService } from "./opencodeService";
import { OpenCodeSidebarProvider } from "./sidebarProvider";
import { OpenCodeSettingsPanel } from "./settingsPanel";

export async function activate(context: vscode.ExtensionContext) {
  const service = new OpenCodeService(context);
  const provider = new OpenCodeSidebarProvider(context, service);
  const settingsPanel = new OpenCodeSettingsPanel(context, service);

  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBar.command = "opencodeVisual.focus";
  context.subscriptions.push(
    statusBar,
    service.onDidChangeState((state) => {
      switch (state.connection.status) {
        case "connected": {
          statusBar.text = "$(check) OpenCode";
          statusBar.tooltip = `Connected to ${state.connection.baseUrl}`;
          statusBar.backgroundColor = undefined;
          statusBar.command = "opencodeVisual.focus";
          break;
        }
        case "connecting": {
          statusBar.text = "$(sync~spin) OpenCode";
          statusBar.tooltip = state.connection.error ?? "Connecting...";
          statusBar.backgroundColor = undefined;
          statusBar.command = "opencodeVisual.focus";
          break;
        }
        case "error": {
          statusBar.text = "$(warning) OpenCode";
          statusBar.tooltip = state.connection.error ?? "OpenCode connection error";
          statusBar.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
          statusBar.command = "opencodeVisual.openSettings";
          break;
        }
      }
      statusBar.show();
    }),
  );

  const syncWorkspace = (reloadOnChange: boolean) => {
    void service
      .syncWorkspaceContext()
      .then(async (changed) => {
        if (!reloadOnChange || !changed) {
          return;
        }
        await provider.reload();
      })
      .catch((error) => {
        service.logOutput(`[syncWorkspace] ${error instanceof Error ? error.message : String(error)}`);
      });
  };

  context.subscriptions.push(service, provider, settingsPanel);
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
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (!event.affectsConfiguration("opencodeVisual")) {
        return;
      }
      void provider.reload();
      void settingsPanel.reload();
    }),
    vscode.window.onDidChangeVisibleTextEditors(() => {
      syncWorkspace(false);
    }),
    vscode.window.onDidChangeActiveColorTheme(() => {
      provider.notifyTheme();
      settingsPanel.notifyTheme();
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
      await settingsPanel.open();
    }),
    vscode.commands.registerCommand("opencodeVisual.restartServer", async () => {
      await service.ensureServerReady(true);
      await provider.reload();
      await settingsPanel.reload();
    }),
    vscode.commands.registerCommand("opencodeVisual.openTerminal", async () => {
      const settings = vscode.workspace.getConfiguration("opencodeVisual");
      const opencodePath = settings.get<string>("opencodePath", "opencode");
      const workspace = service.getWorkspaceContext();
      const cwd = workspace.directory;
      const terminal = vscode.window.createTerminal({
        name: "OpenCode",
        cwd,
      });
      terminal.sendText(opencodePath);
      terminal.show();
    }),
    vscode.commands.registerCommand("opencodeVisual.installCli", async () => {
      await service.installCli();
    }),
    vscode.commands.registerCommand("opencodeVisual.switchSession", async () => {
      const state = service.getState();
      if (state.sessions.length === 0) {
        void vscode.window.showInformationMessage("No OpenCode sessions available.");
        return;
      }

      const items = state.sessions.map((session) => ({
        label: session.title || "Untitled session",
        description: session.id,
        picked: session.id === state.activeSessionId,
        sessionId: session.id,
      }));

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: "Select an OpenCode session",
        canPickMany: false,
      });

      if (!selected) {
        return;
      }

      await service.selectSession(selected.sessionId);
      await provider.reveal();
    }),
  );

  const cliAvailable = await service.ensureCliInstalled();
  if (cliAvailable) {
    void service.ensureServerReady().catch((error) => {
      service.logOutput(
        `[activate] Server readiness check failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  }
}

export function deactivate() {
  // VS Code disposes subscriptions registered during activation.
}
