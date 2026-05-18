import * as vscode from "vscode";
import { OpenCodeService } from "./opencodeService";
import type {
  ExtensionSettingKey,
  ExtensionSettings,
  HostToWebviewMessage,
  WebviewToHostMessage,
} from "./webviewProtocol";

export type NativeSettings = {
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

export function getNativeSettings(): NativeSettings {
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

export function getExtensionSettings(): ExtensionSettings {
  const config = vscode.workspace.getConfiguration("opencodeVisual");
  return {
    opencodePath: config.get<string>("opencodePath", "opencode"),
    serverBaseUrl: config.get<string>("serverBaseUrl", "http://127.0.0.1:4096"),
    autoStartServer: config.get<boolean>("autoStartServer", true),
    debugServerLogs: config.get<boolean>("debugServerLogs", false),
  };
}

export async function setExtensionSetting(key: ExtensionSettingKey, value: string | boolean) {
  const config = vscode.workspace.getConfiguration("opencodeVisual");

  if ((key === "opencodePath" || key === "serverBaseUrl") && typeof value !== "string") {
    throw new Error(`Invalid value for ${key}`);
  }

  if ((key === "autoStartServer" || key === "debugServerLogs") && typeof value !== "boolean") {
    throw new Error(`Invalid value for ${key}`);
  }

  await config.update(key, value, vscode.ConfigurationTarget.Global);
  return getExtensionSettings();
}

export async function shouldDisableHealthCheck(serverUrl: string): Promise<boolean> {
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

export function getColorScheme(): "light" | "dark" {
  const kind = vscode.window.activeColorTheme.kind;
  if (kind === vscode.ColorThemeKind.Light || kind === vscode.ColorThemeKind.HighContrastLight) {
    return "light";
  }
  return "dark";
}

export function resolveFetchUrl(input: string, service: OpenCodeService) {
  try {
    const url = new URL(input);
    if (url.hostname === "opencode.localhost") {
      const base = service.getResolvedServerBaseUrl();
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

export function isLocalHostname(hostname: string) {
  const normalized = hostname.toLowerCase();
  return (
    normalized === "opencode.localhost" ||
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized === "[::1]"
  );
}

export function buildFetchCandidates(input: string, service: OpenCodeService) {
  const primary = resolveFetchUrl(input, service);
  try {
    const url = new URL(primary);
    if (!isLocalHostname(url.hostname)) {
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

export function isNetworkFailure(error: unknown) {
  const text = error instanceof Error ? error.message : String(error);
  return /econnrefused|econnreset|econnaborted|fetch failed|timed out|enotfound|eai_again|socket|network error/i.test(
    text,
  );
}

export async function handleFetch(
  message: Extract<WebviewToHostMessage, { type: "fetchRequest" }>,
  service: OpenCodeService,
  fetches: Map<string, AbortController>,
  postMessage: (message: HostToWebviewMessage) => void,
) {
  const abort = new AbortController();
  fetches.set(message.requestId, abort);

  try {
    let response: Response | undefined;
    let finalUrl = resolveFetchUrl(message.url, service);
    let lastError: unknown;

    for (const candidateUrl of buildFetchCandidates(message.url, service)) {
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
        if (abort.signal.aborted || !isNetworkFailure(error)) {
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

      const urls = buildFetchCandidates(message.url, service);
      const detail = `method=${message.method} urls=${urls.join(",")} error=${errorName ?? "Error"}: ${messageText}`;
      service.reportNetworkIssue(detail);
    }
  } finally {
    fetches.delete(message.requestId);
  }
}

export async function pickDirectory(
  requestId: string,
  title: string | undefined,
  multiple: boolean,
  postMessage: (message: HostToWebviewMessage) => void,
) {
  try {
    const result = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: multiple,
      openLabel: title || "Select folder",
    });

    if (!result || result.length === 0) {
      postMessage({
        type: "pickDirectoryResult",
        requestId,
        value: null,
      });
      return;
    }

    const paths = result.map((uri) => uri.fsPath);
    postMessage({
      type: "pickDirectoryResult",
      requestId,
      value: multiple ? paths : paths[0],
    });
  } catch {
    postMessage({
      type: "pickDirectoryResult",
      requestId,
      value: null,
    });
  }
}
