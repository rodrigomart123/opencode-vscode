import { describe, it } from "node:test";
import assert from "node:assert";
import { WebviewStorageBridge } from "../src/storageBridge";
import type { HostToWebviewMessage } from "../src/webviewProtocol";

function recorder() {
  const seen: HostToWebviewMessage[] = [];
  return {
    seen,
    sink: (message: HostToWebviewMessage) => {
      seen.push(message);
    },
  };
}

function storageSet(key: string, value: string) {
  return { type: "storageSet" as const, key, value };
}

function storageRemove(key: string) {
  return { type: "storageRemove" as const, key };
}

describe("WebviewStorageBridge", () => {
  it("ignores keys outside the shared allowlist", () => {
    const bridge = new WebviewStorageBridge();
    const a = recorder();
    const b = recorder();
    bridge.register("a", a.sink);
    bridge.register("b", b.sink);

    bridge.apply("a", storageSet("some.random.key", "1"));
    bridge.apply("a", storageRemove("some.random.key"));

    assert.strictEqual(bridge.snapshot()["some.random.key"], undefined);
    assert.deepStrictEqual(a.seen, []);
    assert.deepStrictEqual(b.seen, []);
  });

  it("shares whitelisted keys with other webviews but not the writer", () => {
    const bridge = new WebviewStorageBridge();
    const a = recorder();
    const b = recorder();
    bridge.register("sidebar", a.sink);
    bridge.register("settings", b.sink);

    bridge.apply("sidebar", storageSet("settings.v3", '{"ui":{}}'));

    assert.strictEqual(bridge.snapshot()["settings.v3"], '{"ui":{}}');
    assert.deepStrictEqual(a.seen, []);
    assert.deepStrictEqual(b.seen, [{ type: "storageSync", key: "settings.v3", value: '{"ui":{}}' }]);
  });

  it("does not rebroadcast an unchanged value", () => {
    const bridge = new WebviewStorageBridge();
    const b = recorder();
    bridge.register("sidebar", () => undefined);
    bridge.register("settings", b.sink);

    bridge.apply("sidebar", storageSet("opencode-theme-oc-2", "dark"));
    bridge.apply("sidebar", storageSet("opencode-theme-oc-2", "dark"));

    assert.strictEqual(b.seen.length, 1);
  });

  it("broadcasts null when a shared key is removed", () => {
    const bridge = new WebviewStorageBridge();
    const b = recorder();
    bridge.register("sidebar", () => undefined);
    bridge.register("settings", b.sink);

    bridge.apply("sidebar", storageSet("opencode.global.dat:layout.page", "session"));
    bridge.apply("sidebar", storageRemove("opencode.global.dat:layout.page"));

    assert.deepStrictEqual(b.seen, [
      { type: "storageSync", key: "opencode.global.dat:layout.page", value: "session" },
      { type: "storageSync", key: "opencode.global.dat:layout.page", value: null },
    ]);
    assert.strictEqual(bridge.snapshot()["opencode.global.dat:layout.page"], undefined);
  });

  it("ignores removal of keys it never saw", () => {
    const bridge = new WebviewStorageBridge();
    const b = recorder();
    bridge.register("sidebar", () => undefined);
    bridge.register("settings", b.sink);

    bridge.apply("sidebar", storageRemove("settings.v3"));

    assert.deepStrictEqual(b.seen, []);
  });

  it("replays its snapshot on ready()", () => {
    const bridge = new WebviewStorageBridge();
    bridge.register("sidebar", () => undefined);
    bridge.apply("sidebar", storageSet("settings.v3", "one"));
    bridge.apply("sidebar", storageSet("opencode.settings.dat:defaultServerUrl", "http://127.0.0.1:4096"));

    const late = recorder();
    bridge.register("late", late.sink);
    bridge.ready("late");

    assert.deepStrictEqual(
      late.seen.sort((x, y) => (x.type === "storageSync" ? x.key.localeCompare(y.key as string) : 0)),
      [
        { type: "storageSync", key: "opencode.settings.dat:defaultServerUrl", value: "http://127.0.0.1:4096" },
        { type: "storageSync", key: "settings.v3", value: "one" },
      ],
    );
  });

  it("ready() is a no-op for unknown ids", () => {
    const bridge = new WebviewStorageBridge();
    bridge.ready("ghost");
    assert.deepStrictEqual(bridge.snapshot(), {});
  });

  it("stops delivering after unregister", () => {
    const bridge = new WebviewStorageBridge();
    const b = recorder();
    const unregister = bridge.register("settings", b.sink);
    bridge.register("sidebar", () => undefined);

    bridge.apply("sidebar", storageSet("settings.v3", "first"));
    unregister();
    bridge.apply("sidebar", storageSet("settings.v3", "second"));

    assert.deepStrictEqual(b.seen, [{ type: "storageSync", key: "settings.v3", value: "first" }]);
  });
});
