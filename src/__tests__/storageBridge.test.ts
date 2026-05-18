import { describe, it, expect, beforeEach } from "vitest";
import { WebviewStorageBridge } from "../storageBridge";

describe("WebviewStorageBridge", () => {
  let bridge: WebviewStorageBridge;

  beforeEach(() => {
    bridge = new WebviewStorageBridge();
  });

  it("should register and unregister sinks", () => {
    const messages: unknown[] = [];
    const stop = bridge.register("test", (msg) => messages.push(msg));

    expect(bridge.snapshot()).toEqual({});
    stop();

    // After unregistering, applying should not broadcast
    bridge.apply("other", { type: "storageSet", key: "settings.v3", value: "{}" });
    expect(messages.length).toBe(0);
  });

  it("should snapshot stored data", () => {
    bridge.apply("test", { type: "storageSet", key: "settings.v3", value: '{"theme":"dark"}' });
    expect(bridge.snapshot()).toEqual({ "settings.v3": '{"theme":"dark"}' });
  });

  it("should broadcast to other sinks on set", () => {
    const sink1Messages: unknown[] = [];
    const sink2Messages: unknown[] = [];

    bridge.register("sink1", (msg) => sink1Messages.push(msg));
    bridge.register("sink2", (msg) => sink2Messages.push(msg));

    bridge.apply("sink1", { type: "storageSet", key: "settings.v3", value: "test" });

    // sink1 should not receive its own broadcast
    expect(sink1Messages.length).toBe(0);
    // sink2 should receive the broadcast
    expect(sink2Messages.length).toBe(1);
    expect(sink2Messages[0]).toEqual({ type: "storageSync", key: "settings.v3", value: "test" });
  });

  it("should not broadcast duplicate values", () => {
    const messages: unknown[] = [];
    bridge.register("sink2", (msg) => messages.push(msg));

    bridge.apply("sink1", { type: "storageSet", key: "settings.v3", value: "test" });
    bridge.apply("sink1", { type: "storageSet", key: "settings.v3", value: "test" });

    expect(messages.length).toBe(1);
  });

  it("should handle remove operations", () => {
    const messages: unknown[] = [];
    bridge.register("sink2", (msg) => messages.push(msg));

    bridge.apply("sink1", { type: "storageSet", key: "settings.v3", value: "test" });
    bridge.apply("sink1", { type: "storageRemove", key: "settings.v3" });

    expect(bridge.snapshot()).toEqual({});
    expect(messages.length).toBe(2);
    expect(messages[1]).toEqual({ type: "storageSync", key: "settings.v3", value: null });
  });

  it("should ignore remove for non-existent keys", () => {
    const messages: unknown[] = [];
    bridge.register("sink2", (msg) => messages.push(msg));

    bridge.apply("sink1", { type: "storageRemove", key: "settings.v3" });

    expect(messages.length).toBe(0);
  });

  it("should filter non-shared keys", () => {
    const messages: unknown[] = [];
    bridge.register("sink2", (msg) => messages.push(msg));

    bridge.apply("sink1", { type: "storageSet", key: "random-key", value: "test" });
    bridge.apply("sink1", { type: "storageSet", key: "opencode.global.dat:language", value: "en" });

    expect(messages.length).toBe(1);
    expect(bridge.snapshot()).toEqual({ "opencode.global.dat:language": "en" });
  });

  it("should ready a sink with current data", () => {
    const messages: unknown[] = [];
    bridge.apply("other", { type: "storageSet", key: "settings.v3", value: "test" });

    bridge.register("sink1", (msg) => messages.push(msg));
    bridge.ready("sink1");

    expect(messages.length).toBe(1);
    expect(messages[0]).toEqual({ type: "storageSync", key: "settings.v3", value: "test" });
  });
});
