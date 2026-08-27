import { describe, it } from "node:test";
import assert from "node:assert";
import { themePreload } from "../src/preloadScripts";

const SIGNATURE_KEY = "opencode.vscode.nativeSignature";
const SETTINGS_KEY = "settings.v3";
const MODEL_KEY = "opencode.global.dat:model";

type Store = Map<string, string>;

function makeEnv(config: Record<string, unknown>, initial?: Record<string, string>) {
  const store: Store = new Map(Object.entries(initial ?? {}));
  const documentElement = { dataset: {} as Record<string, string> };
  const env: Record<string, unknown> = {
    localStorage: {
      getItem: (key: string) => (store.has(key) ? (store.get(key) as string) : null),
      setItem: (key: string, value: string) => {
        store.set(key, String(value));
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
    },
    matchMedia: () => ({ matches: false }),
    document: {
      documentElement,
      createElement: () => ({ id: "" }),
      head: { appendChild: () => undefined },
    },
  };
  (env as Record<string, unknown>).window = env;
  env.__OPENCODE_VSCODE_CONFIG__ = config;

  return {
    store,
    documentElement,
    run() {
      new Function("window", "localStorage", "document", "matchMedia", "btoa", "atob", "TextEncoder", themePreload)(
        env.window,
        env.localStorage,
        env.document,
        env.matchMedia,
        (value: string) => Buffer.from(value).toString("base64"),
        (value: string) => Buffer.from(value, "base64").toString(),
        TextEncoder,
      );
    },
  };
}

function baseNativeSettings(overrides: Record<string, unknown> = {}) {
  return {
    language: "auto",
    uiColorScheme: "dark",
    themeId: "oc-2",
    uiFont: "",
    codeFont: "",
    autoSave: true,
    fontSize: 14,
    showReasoningSummaries: false,
    shellToolPartsExpanded: false,
    editToolPartsExpanded: false,
    releaseNotes: true,
    checkUpdatesOnStartup: true,
    notifyAgent: true,
    notifyPermissions: true,
    notifyErrors: false,
    soundAgentEnabled: true,
    soundAgent: "staplebops-01",
    soundPermissionsEnabled: true,
    soundPermissions: "staplebops-02",
    soundErrorsEnabled: true,
    soundErrors: "nope-03",
    autoAcceptWorkspacePermissions: false,
    customKeybinds: null,
    modelVisibility: null,
    ...overrides,
  };
}

describe("themePreload", () => {
  it("applies native settings on first render and records a signature", () => {
    const env = makeEnv({
      colorScheme: "dark",
      workspaceDirectory: null,
      nativeSettings: baseNativeSettings({ fontSize: 20 }),
    });

    env.run();

    const settings = JSON.parse(env.store.get(SETTINGS_KEY) ?? "{}");
    assert.strictEqual(settings.appearance.fontSize, 20);
    assert.ok(env.store.get(SIGNATURE_KEY), "signature should be stored");
  });

  it("leaves in-app settings untouched when native settings are unchanged", () => {
    const nativeSettings = baseNativeSettings({ fontSize: 20 });
    const config = { colorScheme: "dark", workspaceDirectory: null, nativeSettings };

    const env = makeEnv(config);
    env.run();

    // Simulate the user changing something in-app between renders.
    const userEdited = JSON.parse(env.store.get(SETTINGS_KEY) ?? "{}");
    userEdited.appearance.fontSize = 18;
    env.store.set(SETTINGS_KEY, JSON.stringify(userEdited));

    env.run();

    const afterReload = JSON.parse(env.store.get(SETTINGS_KEY) ?? "{}");
    assert.strictEqual(afterReload.appearance.fontSize, 18, "reload must not revert in-app change");
  });

  it("re-applies when a native setting actually changes", () => {
    const config = (fontSize: number) => ({
      colorScheme: "dark" as const,
      workspaceDirectory: null,
      nativeSettings: baseNativeSettings({ fontSize }),
    });

    const env = makeEnv(config(16));
    env.run();
    env.store.delete(SIGNATURE_KEY === "" ? "" : "__noop__"); // no-op, keep store honest
    // Re-render with a changed VS Code setting.
    const changed = makeEnv(config(22), Object.fromEntries(env.store));
    changed.run();

    const settings = JSON.parse(changed.store.get(SETTINGS_KEY) ?? "{}");
    assert.strictEqual(settings.appearance.fontSize, 22);
  });

  it("does not clobber in-app model visibility while VS Code modelVisibility is unchanged", () => {
    const nativeSettings = baseNativeSettings({
      modelVisibility: { "anthropic/claude-sonnet-4": "hide" },
    });
    const config = { colorScheme: "dark", workspaceDirectory: null, nativeSettings };

    const env = makeEnv(config);
    env.run();

    const modelStore = JSON.parse(env.store.get(MODEL_KEY) ?? "{}");
    assert.deepStrictEqual(modelStore.user, [
      { providerID: "anthropic", modelID: "claude-sonnet-4", visibility: "hide" },
    ]);

    // User re-shows the model inside the app.
    modelStore.user = [{ providerID: "anthropic", modelID: "claude-sonnet-4", visibility: "show" }];
    modelStore.recent = ["anthropic/claude-sonnet-4"];
    env.store.set(MODEL_KEY, JSON.stringify(modelStore));

    env.run();

    const afterReload = JSON.parse(env.store.get(MODEL_KEY) ?? "{}");
    assert.strictEqual(afterReload.user[0].visibility, "show", "in-app model visibility must survive reload");
    assert.deepStrictEqual(afterReload.recent, ["anthropic/claude-sonnet-4"]);
  });

  it("rebuilds model visibility when VS Code modelVisibility changes", () => {
    const config = (visibility: Record<string, string> | null) => ({
      colorScheme: "dark",
      workspaceDirectory: null,
      nativeSettings: baseNativeSettings({ modelVisibility: visibility }),
    });

    const first = makeEnv(config({ "anthropic/claude-sonnet-4": "hide" }));
    first.run();
    assert.strictEqual(JSON.parse(first.store.get(MODEL_KEY)!).user[0].visibility, "hide");

    const second = makeEnv(config({ "anthropic/claude-sonnet-4": "show" }), Object.fromEntries(first.store));
    second.run();
    assert.strictEqual(JSON.parse(second.store.get(MODEL_KEY)!).user[0].visibility, "show");
  });

  it("writes nothing app-owned when nativeSettings are absent", () => {
    const env = makeEnv({ colorScheme: "light", workspaceDirectory: null, nativeSettings: null });
    env.run();

    assert.strictEqual(env.store.get(SETTINGS_KEY), undefined);
    assert.strictEqual(env.store.get(MODEL_KEY), undefined);
    assert.strictEqual(env.store.get(SIGNATURE_KEY), undefined);
    assert.strictEqual(env.documentElement.dataset.theme, "oc-2");
  });
});
