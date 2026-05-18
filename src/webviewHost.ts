import * as vscode from "vscode";
import type { OpenCodeService } from "./opencodeService";
import type {
  ExtensionSettingKey,
  ExtensionSettings,
  HostToWebviewMessage,
  WebviewToHostMessage,
} from "./webviewProtocol";

type NativeSettings = {
  language: string;
  uiColorScheme: "system" | "light" | "dark";
  themeId: string;
  uiFont: string;
  codeFont: string;
  autoSave: boolean;
  fontSize: number;
  showReasoningSummaries: boolean;
  shellToolPartsExpanded: boolean;
  editToolPartsExpanded: boolean;
  releaseNotes: boolean;
  checkUpdatesOnStartup: boolean;
  notifyAgent: boolean;
  notifyPermissions: boolean;
  notifyErrors: boolean;
  soundAgentEnabled: boolean;
  soundAgent: string;
  soundPermissionsEnabled: boolean;
  soundPermissions: string;
  soundErrorsEnabled: boolean;
  soundErrors: string;
  autoAcceptWorkspacePermissions: boolean;
  customKeybinds: Record<string, string> | null;
  modelVisibility: Record<string, "show" | "hide"> | null;
};

export class WebviewHost {
  private readonly fetches = new Map<string, AbortController>();

  constructor(private readonly service: OpenCodeService) {}

  dispose() {
    for (const abort of this.fetches.values()) {
      abort.abort();
    }
    this.fetches.clear();
  }

  getNativeSettings(): NativeSettings {
    const config = vscode.workspace.getConfiguration("opencodeVisual");
    return {
      language: config.get<string>("language", "auto"),
      uiColorScheme: config.get<"system" | "light" | "dark">("uiColorScheme", "system"),
      themeId: config.get<string>("themeId", "oc-2"),
      uiFont: config.get<string>("uiFont", ""),
      codeFont: config.get<string>("codeFont", ""),
      autoSave: config.get<boolean>("autoSave", true),
      fontSize: config.get<number>("fontSize", 14),
      showReasoningSummaries: config.get<boolean>("showReasoningSummaries", false),
      shellToolPartsExpanded: config.get<boolean>("shellToolPartsExpanded", false),
      editToolPartsExpanded: config.get<boolean>("editToolPartsExpanded", false),
      releaseNotes: config.get<boolean>("releaseNotes", true),
      checkUpdatesOnStartup: config.get<boolean>("checkUpdatesOnStartup", true),
      notifyAgent: config.get<boolean>("notifyAgent", true),
      notifyPermissions: config.get<boolean>("notifyPermissions", true),
      notifyErrors: config.get<boolean>("notifyErrors", false),
      soundAgentEnabled: config.get<boolean>("soundAgentEnabled", true),
      soundAgent: config.get<string>("soundAgent", "staplebops-01"),
      soundPermissionsEnabled: config.get<boolean>("soundPermissionsEnabled", true),
      soundPermissions: config.get<string>("soundPermissions", "staplebops-02"),
      soundErrorsEnabled: config.get<boolean>("soundErrorsEnabled", true),
      soundErrors: config.get<string>("soundErrors", "nope-03"),
      autoAcceptWorkspacePermissions: config.get<boolean>("autoAcceptWorkspacePermissions", false),
      customKeybinds: config.get<Record<string, string> | null>("customKeybinds", null),
      modelVisibility: config.get<Record<string, "show" | "hide"> | null>("modelVisibility", null),
    };
  }

  getExtensionSettings(): ExtensionSettings {
    const config = vscode.workspace.getConfiguration("opencodeVisual");
    return {
      opencodePath: config.get<string>("opencodePath", "opencode"),
      serverBaseUrl: config.get<string>("serverBaseUrl", "http://127.0.0.1:4096"),
      autoStartServer: config.get<boolean>("autoStartServer", true),
      debugServerLogs: config.get<boolean>("debugServerLogs", false),
    };
  }

  async setExtensionSetting(key: ExtensionSettingKey, value: string | boolean): Promise<ExtensionSettings> {
    const config = vscode.workspace.getConfiguration("opencodeVisual");

    if ((key === "opencodePath" || key === "serverBaseUrl") && typeof value !== "string") {
      throw new Error(`Invalid value for ${key}: expected string`);
    }

    if (key === "serverBaseUrl" && typeof value === "string") {
      try {
        const url = new URL(value);
        if (!/^https?:$/.test(url.protocol)) {
          throw new Error(`serverBaseUrl must use http or https protocol: ${value}`);
        }
      } catch {
        throw new Error(`Invalid serverBaseUrl: ${value}`);
      }
    }

    if ((key === "autoStartServer" || key === "debugServerLogs") && typeof value !== "boolean") {
      throw new Error(`Invalid value for ${key}: expected boolean`);
    }

    const target = vscode.workspace.workspaceFolders
      ? vscode.ConfigurationTarget.Workspace
      : vscode.ConfigurationTarget.Global;
    await config.update(key, value, target);
    return this.getExtensionSettings();
  }

  getColorScheme(): "light" | "dark" {
    const kind = vscode.window.activeColorTheme.kind;
    if (kind === vscode.ColorThemeKind.Light || kind === vscode.ColorThemeKind.HighContrastLight) {
      return "light";
    }
    return "dark";
  }

  async shouldDisableHealthCheck(serverUrl: string): Promise<boolean> {
    let target: string;
    try {
      target = new URL("/global/health", serverUrl).toString();
    } catch {
      return true;
    }

    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), 2500);

    try {
      const response = await fetch(target, {
        method: "GET",
        signal: abort.signal,
      });

      if (response.status === 404 || response.status === 405 || response.status === 501) {
        return true;
      }

      if (response.ok) {
        return false;
      }

      const text = await response.text().catch(() => "");
      if (/not found|unknown route|cannot\s+\w+\s+\/global\/health/i.test(text)) {
        return true;
      }

      return false;
    } catch {
      return false;
    } finally {
      clearTimeout(timeout);
    }
  }

  resolveFetchUrl(input: string): string {
    try {
      const url = new URL(input);
      if (url.hostname === "opencode.localhost") {
        const base = this.service.getResolvedServerBaseUrl();
        try {
          const target = new URL(base);
          url.protocol = target.protocol;
          url.hostname = target.hostname;
          url.port = target.port;
        } catch {
          url.hostname = "127.0.0.1";
        }
      }
      return url.toString();
    } catch {
      return input;
    }
  }

  private isLocalHostname(hostname: string): boolean {
    const normalized = hostname.toLowerCase();
    return (
      normalized === "opencode.localhost" ||
      normalized === "localhost" ||
      normalized === "127.0.0.1" ||
      normalized === "::1" ||
      normalized === "[::1]"
    );
  }

  buildFetchCandidates(input: string): string[] {
    const primary = this.resolveFetchUrl(input);
    try {
      const url = new URL(primary);
      if (!this.isLocalHostname(url.hostname)) {
        return [primary];
      }

      const candidates = [url.toString()];
      for (const host of ["127.0.0.1", "localhost", "[::1]"]) {
        const candidate = new URL(url.toString());
        candidate.hostname = host;
        const value = candidate.toString();
        if (!candidates.includes(value)) {
          candidates.push(value);
        }
      }
      return candidates;
    } catch {
      return [primary];
    }
  }

  private isNetworkFailure(error: unknown): boolean {
    const text = error instanceof Error ? error.message : String(error);
    return /econnrefused|econnreset|econnaborted|fetch failed|timed out|enotfound|eai_again|socket|network error/i.test(
      text,
    );
  }

  async handleFetch(
    message: Extract<WebviewToHostMessage, { type: "fetchRequest" }>,
    postMessage: (message: HostToWebviewMessage) => void,
  ): Promise<void> {
    const abort = new AbortController();
    this.fetches.set(message.requestId, abort);

    try {
      let response: Response | undefined;
      let finalUrl = this.resolveFetchUrl(message.url);
      let lastError: unknown;

      for (const candidateUrl of this.buildFetchCandidates(message.url)) {
        finalUrl = candidateUrl;
        try {
          response = await fetch(candidateUrl, {
            method: message.method,
            headers: message.headers,
            body: message.body ? Buffer.from(message.body, "base64") : undefined,
            signal: abort.signal,
          });
          break;
        } catch (error) {
          lastError = error;
          if (abort.signal.aborted || !this.isNetworkFailure(error)) {
            throw error;
          }
        }
      }

      if (!response) {
        throw lastError ?? new Error(`Failed to fetch ${finalUrl}`);
      }

      postMessage({
        type: "fetchResponse",
        requestId: message.requestId,
        url: response.url,
        status: response.status,
        statusText: response.statusText,
        headers: [...response.headers.entries()],
      });

      const reader = response.body?.getReader();
      if (!reader) {
        postMessage({ type: "fetchEnd", requestId: message.requestId });
        return;
      }

      while (true) {
        const result = await reader.read();
        if (result.done) {
          break;
        }

        postMessage({
          type: "fetchChunk",
          requestId: message.requestId,
          chunk: Buffer.from(result.value).toString("base64"),
        });
      }

      postMessage({ type: "fetchEnd", requestId: message.requestId });
    } catch (error) {
      if (!abort.signal.aborted) {
        const messageText = error instanceof Error ? error.message : String(error);
        const errorName = error instanceof Error ? error.name : undefined;
        postMessage({
          type: "fetchError",
          requestId: message.requestId,
          message: messageText,
          name: errorName,
        });

        const urls = this.buildFetchCandidates(message.url);
        const detail = `method=${message.method} urls=${urls.join(",")} error=${errorName ?? "Error"}: ${messageText}`;
        this.service.reportNetworkIssue(detail);
      }
    } finally {
      this.fetches.delete(message.requestId);
    }
  }

  abortFetch(requestId: string): void {
    this.fetches.get(requestId)?.abort();
    this.fetches.delete(requestId);
  }
}
