import * as path from "node:path";
import * as vscode from "vscode";
import { getWebviewHtml } from "./webviewHtml";
import { OpenCodeService } from "./opencodeService";
import { storageBridge } from "./storageBridge";
import {
  getNativeSettings,
  getExtensionSettings,
  setExtensionSetting,
  shouldDisableHealthCheck,
  getColorScheme,
  handleFetch,
  pickDirectory,
} from "./webviewHostUtils";
import type {
  HostAction,
  HostToWebviewMessage,
  WebviewToHostMessage,
} from "./webviewProtocol";

export class OpenCodeSidebarProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  static readonly viewId = "opencodeVisual.sidebar";
  private static readonly diffScheme = "opencode-diff";
  private static readonly maxDiffEntries = 200;

  private readonly disposables: vscode.Disposable[] = [];
  private readonly fetches = new Map<string, AbortController>();
  private readonly diffContent = new Map<string, string>();
  private view?: vscode.WebviewView;
  private ready = false;
  private readonly pendingMessages: HostToWebviewMessage[] = [];
  private readonly stop = storageBridge.register("sidebar", (message) => this.postMessage(message));

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly service: OpenCodeService,
  ) {
    this.disposables.push(
      vscode.workspace.registerTextDocumentContentProvider(OpenCodeSidebarProvider.diffScheme, {
        provideTextDocumentContent: (uri) => this.diffContent.get(uri.toString()) ?? "",
      }),
      vscode.workspace.onDidCloseTextDocument((document) => {
        if (document.uri.scheme !== OpenCodeSidebarProvider.diffScheme) {
          return;
        }
        this.diffContent.delete(document.uri.toString());
      }),
    );
  }

  dispose() {
    this.stop();
    vscode.Disposable.from(...this.disposables).dispose();
  }

  async reveal() {
    await vscode.commands.executeCommand("workbench.view.extension.opencodeVisual");
    this.view?.show?.(true);
  }

  async toggle() {
    if (this.view?.visible) {
      await vscode.commands.executeCommand("workbench.action.closeSidebar");
      await vscode.commands.executeCommand("workbench.action.closeAuxiliaryBar");
      await vscode.commands.executeCommand("workbench.action.closePanel");
    } else {
      await this.reveal();
    }
  }

  async reload() {
    await this.render();
  }

  async openSettings() {
    await vscode.commands.executeCommand("opencodeVisual.openSettings");
  }

  dispatchAction(action: HostAction) {
    this.postMessage({ type: "hostAction", action });
  }

  notifyTheme() {
    this.postMessage({
      type: "hostTheme",
      colorScheme: getColorScheme(),
    });
  }

  async resolveWebviewView(webviewView: vscode.WebviewView) {
    this.view = webviewView;
    this.ready = false;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, "media")],
    };
    const receiveDisposable = webviewView.webview.onDidReceiveMessage(async (message: WebviewToHostMessage) => {
      await this.handleMessage(message);
    });

    const disposeDisposable = webviewView.onDidDispose(() => {
      this.view = undefined;
      receiveDisposable.dispose();
    });

    this.disposables.push(receiveDisposable, disposeDisposable);
    await this.render();
  }

  private async handleMessage(message: WebviewToHostMessage) {
    try {
      if (message.type === "webviewReady") {
        this.ready = true;
        this.flushMessages();
        this.notifyTheme();
        storageBridge.ready("sidebar");
        return;
      }

      if (message.type === "openLink") {
        await vscode.env.openExternal(vscode.Uri.parse(message.url));
        return;
      }

      if (message.type === "openFile") {
        await this.openFile(message.filePath, message.range);
        return;
      }

      if (message.type === "openDiff") {
        await this.openDiff(message.filePath, message.before, message.after);
        return;
      }

      if (message.type === "openSettings") {
        await this.openSettings();
        return;
      }

      if (message.type === "pickDirectory") {
        await pickDirectory(message.requestId, message.title, message.multiple, (msg) => this.postMessage(msg));
        return;
      }

      if (message.type === "fetchAbort") {
        this.fetches.get(message.requestId)?.abort();
        this.fetches.delete(message.requestId);
        return;
      }

      if (message.type === "fetchRequest") {
        await handleFetch(message, this.service, this.fetches, (msg) => this.postMessage(msg));
        return;
      }

      if (message.type === "getExtensionSettings") {
        this.postMessage({
          type: "extensionSettingsResult",
          requestId: message.requestId,
          value: getExtensionSettings(),
        });
        return;
      }

      if (message.type === "setExtensionSetting") {
        try {
          const value = await setExtensionSetting(message.key, message.value);
          this.postMessage({
            type: "extensionSettingResult",
            requestId: message.requestId,
            value,
          });
        } catch (error) {
          const text = error instanceof Error ? error.message : String(error);
          this.postMessage({
            type: "extensionSettingResult",
            requestId: message.requestId,
            value: null,
            error: text,
          });
        }
        return;
      }

      if (message.type === "storageSet" || message.type === "storageRemove") {
        storageBridge.apply("sidebar", message);
        return;
      }

      if (message.type === "restartServer") {
        try {
          await vscode.commands.executeCommand("opencodeVisual.restartServer");
          this.postMessage({
            type: "restartServerResult",
            requestId: message.requestId,
          });
        } catch (error) {
          const text = error instanceof Error ? error.message : String(error);
          this.postMessage({
            type: "restartServerResult",
            requestId: message.requestId,
            error: text,
          });
        }
        return;
      }

      return;
    } catch (error) {
      const messageText = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(messageText);
    }
  }

  private async render() {
    if (!this.view) {
      return;
    }

    this.ready = false;
    let disableHealthCheck = false;
    let serverUrl = this.service.getResolvedServerBaseUrl();
    try {
      serverUrl = await this.service.ensureServerReady();
      disableHealthCheck = await shouldDisableHealthCheck(serverUrl);
    } catch (error) {
      this.service.logOutput(`[render] Server not ready: ${error instanceof Error ? error.message : String(error)}`);
      disableHealthCheck = true;
      serverUrl = this.service.getResolvedServerBaseUrl();
    }
    const workspaceDirectory = this.service.getWorkspaceContext().directory ?? null;
    this.view.webview.html = getWebviewHtml(this.view.webview, this.context.extensionUri, {
      serverUrl,
      version: String(this.context.extension.packageJSON.version ?? "0.0.0"),
      workspaceDirectory,
      colorScheme: getColorScheme(),
      disableHealthCheck,
      sharedStorage: storageBridge.snapshot(),
      nativeSettings: getNativeSettings(),
    });
  }

  private async openFile(
    filePath: string,
    range?: {
      startLine: number;
      startCharacter: number;
      endLine: number;
      endCharacter: number;
    },
  ) {
    const baseDirectory = this.service.getActiveSessionDirectory();
    const targetPath = path.isAbsolute(filePath) ? filePath : path.join(baseDirectory ?? "", filePath);
    const uri = vscode.Uri.file(targetPath);
    const document = await vscode.workspace.openTextDocument(uri);
    const editor = await vscode.window.showTextDocument(document, { preview: false });

    if (range) {
      const selection = new vscode.Selection(
        new vscode.Position(range.startLine, range.startCharacter),
        new vscode.Position(range.endLine, range.endCharacter),
      );
      editor.selection = selection;
      editor.revealRange(selection, vscode.TextEditorRevealType.InCenter);
    }
  }

  private async openDiff(filePath: string, before: string, after: string) {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const left = this.createDiffUri(filePath, "before", before, id);
    const right = this.createDiffUri(filePath, "after", after, id);
    const title = `OpenCode Diff: ${filePath}`;
    await vscode.commands.executeCommand("vscode.diff", left, right, title, { preview: false });
  }

  private createDiffUri(filePath: string, side: "before" | "after", content: string, id: string) {
    const normalized = filePath.replaceAll("\\", "/").replace(/^\/+/, "") || "untitled";
    const uri = vscode.Uri.from({
      scheme: OpenCodeSidebarProvider.diffScheme,
      path: `/${side}/${id}/${normalized}`,
    });
    this.diffContent.set(uri.toString(), content);
    this.trimDiffContent();
    return uri;
  }

  private trimDiffContent() {
    while (this.diffContent.size > OpenCodeSidebarProvider.maxDiffEntries) {
      const key = this.diffContent.keys().next().value;
      if (!key) {
        return;
      }
      this.diffContent.delete(key);
    }
  }

  private flushMessages() {
    while (this.ready && this.view && this.pendingMessages.length > 0) {
      const message = this.pendingMessages.shift();
      if (!message) {
        return;
      }
      void this.view.webview.postMessage(message);
    }
  }

  private postMessage(message: HostToWebviewMessage) {
    if (!this.ready || !this.view) {
      this.pendingMessages.push(message);
      return;
    }
    void this.view.webview.postMessage(message);
  }
}
