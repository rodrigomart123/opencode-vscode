import { render } from "solid-js/web";
import { createEffect, createSignal, onCleanup, onMount } from "solid-js";
import { MemoryRouter, useNavigate } from "@solidjs/router";
import { base64Encode } from "@opencode-ai/util/encode";
import { AppBaseProviders, AppInterface } from "@/app";
import { useCommand } from "@/context/command";
import { type Platform, PlatformProvider } from "@/context/platform";
import { ServerConnection } from "@/context/server";
import { useTheme } from "@opencode-ai/ui/theme/context";
import type { HostAction, HostToWebviewMessage, WebviewToHostMessage } from "../../src/webviewProtocol";

declare global {
  interface Window {
    __OPENCODE_VSCODE_CONFIG__?: {
      serverUrl: string;
      version: string;
      workspaceDirectory: string | null;
      colorScheme: "light" | "dark";
    };
    acquireVsCodeApi?: () => {
      postMessage: (message: WebviewToHostMessage) => void;
    };
  }
}

const root = document.getElementById("root");
if (!(root instanceof HTMLElement)) {
  throw new Error("OpenCode webview root not found.");
}

const cfg = window.__OPENCODE_VSCODE_CONFIG__;
if (!cfg || !cfg.serverUrl) {
  throw new Error("OpenCode webview server URL is missing.");
}
const config = cfg;

const vscode = window.acquireVsCodeApi?.();
const nativeFetch = globalThis.fetch.bind(globalThis);
const DEFAULT_SERVER_URL_KEY = "opencode.settings.dat:defaultServerUrl";
const LAST_SESSION_KEY = "opencode.global.dat:layout.page";
const pending = new Map<string, (value: string | string[] | null) => void>();
const requests = new Map<string, {
  resolve: (value: Response | PromiseLike<Response>) => void;
  reject: (reason?: unknown) => void;
  controller?: ReadableStreamDefaultController<Uint8Array>;
}>();
const [hostScheme, setHostScheme] = createSignal<"light" | "dark">(config.colorScheme);

function requestId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function encode(bytes: ArrayBuffer) {
  let value = "";
  const data = new Uint8Array(bytes);
  for (let index = 0; index < data.length; index += 1) {
    value += String.fromCharCode(data[index]);
  }
  return btoa(value);
}

function decode(value: string) {
  const text = atob(value);
  const bytes = new Uint8Array(text.length);
  for (let index = 0; index < text.length; index += 1) {
    bytes[index] = text.charCodeAt(index);
  }
  return bytes;
}

function aliasServerUrl(input: string) {
  try {
    const url = new URL(input);
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "::1") {
      url.hostname = "opencode.localhost";
    }
    return url.toString().replace(/\/$/, "");
  } catch {
    return input;
  }
}

function handleHostMessage(message: HostToWebviewMessage) {
  if (message.type === "hostTheme") {
    setHostScheme(message.colorScheme);
    return true;
  }

  if (message.type === "pickDirectoryResult") {
    const resolve = pending.get(message.requestId);
    if (!resolve) return true;
    pending.delete(message.requestId);
    resolve(message.value);
    return true;
  }

  if (message.type === "fetchResponse") {
    const request = requests.get(message.requestId);
    if (!request) return true;

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        request.controller = controller;
      },
      cancel() {
        vscode?.postMessage({ type: "fetchAbort", requestId: message.requestId });
      },
    });

    request.resolve(new Response(stream, {
      status: message.status,
      statusText: message.statusText,
      headers: message.headers,
    }));
    return true;
  }

  if (message.type === "fetchChunk") {
    const request = requests.get(message.requestId);
    request?.controller?.enqueue(decode(message.chunk));
    return true;
  }

  if (message.type === "fetchEnd") {
    const request = requests.get(message.requestId);
    request?.controller?.close();
    requests.delete(message.requestId);
    return true;
  }

  if (message.type === "fetchError") {
    const request = requests.get(message.requestId);
    if (!request) return true;
    if (request.controller) {
      request.controller.error(new Error(message.message));
    } else {
      request.reject(new TypeError(message.message));
    }
    requests.delete(message.requestId);
    return true;
  }

  return false;
}

function shouldBridge(input: RequestInfo | URL) {
  try {
    const url = input instanceof Request
      ? new URL(input.url)
      : input instanceof URL
        ? input
        : new URL(String(input), window.location.href);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

async function hostFetch(input: RequestInfo | URL, init?: RequestInit) {
  if (!vscode || !shouldBridge(input)) {
    return nativeFetch(input, init);
  }

  const request = input instanceof Request ? input : new Request(input, init);
  const id = requestId();
  const body = request.method === "GET" || request.method === "HEAD"
    ? undefined
    : encode(await request.clone().arrayBuffer());

  const promise = new Promise<Response>((resolve, reject) => {
    requests.set(id, { resolve, reject });
  });

  request.signal.addEventListener("abort", () => {
    vscode.postMessage({ type: "fetchAbort", requestId: id });
  }, { once: true });

  vscode.postMessage({
    type: "fetchRequest",
    requestId: id,
    url: request.url,
    method: request.method,
    headers: [...request.headers.entries()],
    body,
  });

  return promise;
}

globalThis.fetch = hostFetch;

function readStorage(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string | null) {
  try {
    if (value === null) {
      localStorage.removeItem(key);
      return;
    }
    localStorage.setItem(key, value);
  } catch {
    return;
  }
}

function key(dir: string) {
  const value = dir.replaceAll("\\", "/");
  const drive = value.match(/^([A-Za-z]:)\/+$/);
  if (drive) return `${drive[1]}/`;
  if (/^\/+$/i.test(value)) return "/";
  return value.replace(/\/+$/, "");
}

function windows(dir: string) {
  return /^[A-Za-z]:/.test(dir) || dir.startsWith("//");
}

function same(left: string, right: string) {
  const a = key(left);
  const b = key(right);
  if (windows(a) || windows(b)) return a.toLowerCase() === b.toLowerCase();
  return a === b;
}

function dirs(directory: string) {
  const found = new Set<string>([directory]);
  const match = directory.match(/^([A-Za-z]):([\\/].*)$/);
  if (!match) return [...found];
  const rest = match[2];
  if (!rest) return [...found];
  const slash = rest.replaceAll("\\", "/");
  const back = rest.replaceAll("/", "\\");
  found.add(`${match[1]?.toUpperCase()}:${back}`);
  found.add(`${match[1]?.toUpperCase()}:${slash}`);
  found.add(`${match[1]?.toLowerCase()}:${back}`);
  found.add(`${match[1]?.toLowerCase()}:${slash}`);
  return [...found];
}

function readLastSession(directory: string) {
  const raw = readStorage(LAST_SESSION_KEY);
  if (!raw) return;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return;
  }

  if (!parsed || typeof parsed !== "object") return;
  const map = (parsed as { lastProjectSession?: unknown }).lastProjectSession;
  if (!map || typeof map !== "object") return;

  let latest: { directory: string; id: string; at: number } | undefined;
  for (const [root, value] of Object.entries(map as Record<string, unknown>)) {
    if (!same(root, directory)) continue;
    if (!value || typeof value !== "object") continue;

    const item = value as { directory?: unknown; id?: unknown; at?: unknown };
    if (typeof item.directory !== "string" || typeof item.id !== "string") continue;
    if (!same(item.directory, directory)) continue;

    const at = typeof item.at === "number" ? item.at : 0;
    if (!latest || at > latest.at) {
      latest = { directory: item.directory, id: item.id, at };
    }
  }

  return latest;
}

async function hasSession(directory: string, id: string) {
  for (const dir of dirs(directory)) {
    try {
      const url = new URL(`/session/${encodeURIComponent(id)}`, config.serverUrl);
      url.searchParams.set("directory", dir);
      const response = await hostFetch(url.toString(), { method: "GET" });
      if (response.ok) return true;
    } catch {
      continue;
    }
  }
  return false;
}

async function latestSessionID(directory: string) {
  for (const dir of dirs(directory)) {
    try {
      const url = new URL("/session", config.serverUrl);
      url.searchParams.set("directory", dir);
      url.searchParams.set("roots", "true");
      url.searchParams.set("limit", "1");

      const response = await hostFetch(url.toString(), { method: "GET" });
      if (!response.ok) continue;

      const body = await response.json().catch(() => undefined);
      const list = Array.isArray(body)
        ? body
        : body && typeof body === "object" && "data" in body && Array.isArray((body as { data?: unknown }).data)
          ? ((body as { data: unknown[] }).data ?? [])
          : [];

      const first = list[0] as { id?: unknown } | undefined;
      if (first && typeof first.id === "string") return first.id;
    } catch {
      continue;
    }
  }

  return undefined;
}

async function startupPath(directory: string) {
  const slug = base64Encode(directory);
  const saved = readLastSession(directory);
  if (saved && (await hasSession(saved.directory, saved.id))) {
    return `/${slug}/session/${saved.id}`;
  }

  const latest = await latestSessionID(directory);
  if (latest) return `/${slug}/session/${latest}`;
  return `/${slug}/session`;
}

const notify: Platform["notify"] = async (title, description) => {
  if (!("Notification" in window)) return;
  const permission =
    Notification.permission === "default"
      ? await Notification.requestPermission().catch(() => "denied")
      : Notification.permission;

  if (permission !== "granted") return;
  if (document.visibilityState === "visible" && document.hasFocus()) return;

  await Promise.resolve().then(() => {
    new Notification(title, {
      body: description ?? "",
      icon: "https://opencode.ai/favicon-96x96-v3.png",
    });
  }).catch(() => undefined);
};

const platform: Platform = {
  platform: "web",
  version: config.version,
  openLink(url) {
    if (vscode) {
      vscode.postMessage({ type: "openLink", url });
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  },
  back() {
    window.history.back();
  },
  forward() {
    window.history.forward();
  },
  restart: async () => {
    window.location.reload();
  },
  notify,
  fetch: hostFetch,
  openDirectoryPickerDialog(opts) {
    if (!vscode) return Promise.resolve(null);
    return new Promise((resolve) => {
      const id = requestId();
      pending.set(id, resolve);
      vscode.postMessage({
        type: "pickDirectory",
        requestId: id,
        title: opts?.title,
        multiple: opts?.multiple ?? false,
      });
    });
  },
  getDefaultServer: async () => {
    const value = readStorage(DEFAULT_SERVER_URL_KEY);
    return value ? ServerConnection.Key.make(value) : null;
  },
  setDefaultServer(url) {
    writeStorage(DEFAULT_SERVER_URL_KEY, url ?? null);
  },
};

function HostBridge() {
  const command = useCommand();
  const navigate = useNavigate();
  let dead = false;
  let booted = false;

  onCleanup(() => {
    dead = true;
  });

  onMount(() => {
    if (booted) return;
    booted = true;

    const directory = config.workspaceDirectory;
    if (!directory) return;

    void startupPath(directory).then((path) => {
      if (dead) return;
      setTimeout(() => navigate(path, { replace: true }), 0);
    });
  });

  const trigger = (action: HostAction) => {
    if (action === "newSession") {
      command.trigger("session.new", "palette");
      return;
    }

    if (action === "openSettings") {
      command.trigger("settings.open", "palette");
      return;
    }

    if (action === "refresh") {
      window.location.reload();
    }
  };

  onMount(() => {
    const onMessage = (event: MessageEvent<HostToWebviewMessage>) => {
      if (handleHostMessage(event.data)) return;
      if (event.data?.type !== "hostAction") return;
      trigger(event.data.action);
    };

    window.addEventListener("message", onMessage);
    vscode?.postMessage({ type: "webviewReady" });
    onCleanup(() => window.removeEventListener("message", onMessage));
  });

  return null;
}

function HostThemeBridge() {
  const theme = useTheme();
  createEffect(() => {
    const scheme = hostScheme();
    if (theme.colorScheme() === scheme) return;
    theme.setColorScheme(scheme);
  });
  return null;
}

const server: ServerConnection.Http = {
  type: "http",
  displayName: (() => {
    try {
      return new URL(config.serverUrl).host;
    } catch {
      return config.serverUrl;
    }
  })(),
  http: {
    url: aliasServerUrl(config.serverUrl),
  },
};

render(
  () => (
    <PlatformProvider value={platform}>
      <AppBaseProviders>
        <AppInterface
          defaultServer={ServerConnection.Key.make(readStorage(DEFAULT_SERVER_URL_KEY) || config.serverUrl)}
          servers={[server]}
          router={MemoryRouter}
          disableHealthCheck
        >
          <HostThemeBridge />
          <HostBridge />
        </AppInterface>
      </AppBaseProviders>
    </PlatformProvider>
  ),
  root,
);
