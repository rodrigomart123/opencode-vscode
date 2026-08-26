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
import type { HostAction, HostToWebviewMessage, WebviewToHostMessage } from "./webviewProtocol";

export class OpenCodeSettingsPanel implements vscode.Disposable {
  private panel?: vscode.WebviewPanel;
  private ready = false;
  private readonly pendingMessages: HostToWebviewMessage[] = [];
  private readonly fetches = new Map<string, AbortController>();
  private panelDisposables: vscode.Disposable[] = [];
  private readonly stop = storageBridge.register("settings", (message) => this.postMessage(message));

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly service: OpenCodeService,
  ) {}

  dispose() {
    this.stop();
    for (const abort of this.fetches.values()) {
      abort.abort();
    }
    this.fetches.clear();
    this.disposePanel();
  }

  async open() {
    if (!this.panel) {
      await this.createPanel();
      this.dispatchAction("openSettings");
      return;
    }

    try {
      this.panel.reveal(vscode.ViewColumn.Active, false);
      await this.render();
    } catch {
      this.panel = undefined;
      this.clearPanelState();
      await this.createPanel();
    }

    this.dispatchAction("openSettings");
  }

  async reload() {
    if (!this.panel) {
      return;
    }

    try {
      await this.render();
    } catch (error) {
      if (this.isDisposedError(error)) {
        this.resetDisposedPanel();
        return;
      }
      throw error;
    }
  }

  notifyTheme() {
    if (!this.panel) {
      return;
    }
    this.postMessage({
      type: "hostTheme",
      colorScheme: getColorScheme(),
    });
  }

  private async createPanel() {
    const panel = vscode.window.createWebviewPanel(
      "opencodeVisual.settings",
      "OpenCode Settings",
      {
        viewColumn: vscode.ViewColumn.Active,
        preserveFocus: false,
      },
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, "media")],
      },
    );

    this.panel = panel;
    this.ready = false;
    const receiveDisposable = panel.webview.onDidReceiveMessage(async (message: WebviewToHostMessage) => {
      await this.handleMessage(message);
    });
    const disposeDisposable = panel.onDidDispose(() => {
      if (this.panel !== panel) {
        return;
      }
      this.panel = undefined;
      this.clearPanelState();
    });

    this.panelDisposables.push(receiveDisposable, disposeDisposable);
    await this.render();
  }

  private disposePanel() {
    const panel = this.panel;
    this.panel = undefined;
    this.clearPanelState();
    if (panel) {
      panel.dispose();
    }
  }

  private clearPanelState() {
    this.ready = false;
    this.pendingMessages.length = 0;
    for (const abort of this.fetches.values()) {
      abort.abort();
    }
    this.fetches.clear();
    vscode.Disposable.from(...this.panelDisposables).dispose();
    this.panelDisposables = [];
  }

  private isDisposedError(error: unknown) {
    const text = error instanceof Error ? error.message : String(error ?? "");
    return /webview is disposed|disposed/i.test(text);
  }

  private resetDisposedPanel() {
    this.panel = undefined;
    this.clearPanelState();
  }

  private async handleMessage(message: WebviewToHostMessage) {
    try {
      if (message.type === "webviewReady") {
        this.ready = true;
        this.flushMessages();
        storageBridge.ready("settings");
        return;
      }

      if (message.type === "openLink") {
        await vscode.env.openExternal(vscode.Uri.parse(message.url));
        return;
      }

      if (message.type === "openDiff") {
        await this.openDiff(message.filePath, message.before, message.after);
        return;
      }

      if (message.type === "openSettings") {
        this.dispatchAction("openSettings");
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
        storageBridge.apply("settings", message);
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
    } catch (error) {
      const messageText = error instanceof Error ? error.message : String(error);
      void vscode.window.showErrorMessage(messageText);
    }
  }

  private async render() {
    const panel = this.panel;
    if (!panel) {
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
    if (this.panel !== panel) {
      return;
    }

    try {
      panel.webview.html = getWebviewHtml(panel.webview, this.context.extensionUri, {
        serverUrl,
        version: String(this.context.extension.packageJSON.version ?? "0.0.0"),
        workspaceDirectory,
        colorScheme: getColorScheme(),
        disableHealthCheck,
        settingsMode: true,
        sharedStorage: storageBridge.snapshot(),
        nativeSettings: getNativeSettings(),
      });
    } catch (error) {
      if (this.isDisposedError(error)) {
        this.resetDisposedPanel();
        return;
      }
      throw error;
    }
  }

  private async openDiff(filePath: string, before: string, after: string) {
    const left = await vscode.workspace.openTextDocument({ content: before });
    const right = await vscode.workspace.openTextDocument({ content: after });
    const title = `OpenCode Diff: ${filePath}`;
    await vscode.commands.executeCommand("vscode.diff", left.uri, right.uri, title, { preview: false });
  }

  private dispatchAction(action: HostAction) {
    this.postMessage({
      type: "hostAction",
      action,
    });
  }

  private postMessage(message: HostToWebviewMessage) {
    const panel = this.panel;
    if (!this.ready || !panel) {
      this.pendingMessages.push(message);
      return;
    }

    this.sendMessage(panel, message);
  }

  private flushMessages() {
    while (this.ready && this.panel && this.pendingMessages.length > 0) {
      const message = this.pendingMessages.shift();
      if (!message) {
        return;
      }

      const panel = this.panel;
      if (!panel) {
        return;
      }
      this.sendMessage(panel, message);
    }
  }

  private sendMessage(panel: vscode.WebviewPanel, message: HostToWebviewMessage) {
    try {
      void panel.webview.postMessage(message).then(undefined, (error) => {
        if (this.isDisposedError(error)) {
          this.resetDisposedPanel();
          return;
        }

        const text = error instanceof Error ? error.message : String(error);
        void vscode.window.showErrorMessage(text);
      });
    } catch (error) {
      if (this.isDisposedError(error)) {
        this.resetDisposedPanel();
      }
    }
  }
}
