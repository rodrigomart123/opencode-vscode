import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { WebviewHost } from "../webviewHost";

// Mock vscode module
vi.mock("vscode", () => import("../__mocks__/vscode"));

const createMockService = () => ({
  getResolvedServerBaseUrl: vi.fn().mockReturnValue("http://127.0.0.1:4096"),
  reportNetworkIssue: vi.fn(),
});

describe("WebviewHost", () => {
  let host: WebviewHost;
  let mockService: ReturnType<typeof createMockService>;

  beforeEach(() => {
    mockService = createMockService();
    host = new WebviewHost(mockService as unknown as import("../opencodeService").OpenCodeService);
  });

  afterEach(() => {
    host.dispose();
  });

  it("should get extension settings with defaults", () => {
    const settings = host.getExtensionSettings();
    expect(settings).toEqual({
      opencodePath: "opencode",
      serverBaseUrl: "http://127.0.0.1:4096",
      autoStartServer: true,
      debugServerLogs: false,
    });
  });

  it("should resolve fetch URL for opencode.localhost", () => {
    const resolved = host.resolveFetchUrl("http://opencode.localhost/api/test");
    expect(resolved).toBe("http://127.0.0.1:4096/api/test");
  });

  it("should pass through non-localhost URLs", () => {
    const url = "https://example.com/api";
    expect(host.resolveFetchUrl(url)).toBe(url);
  });

  it("should build fetch candidates for localhost", () => {
    const candidates = host.buildFetchCandidates("http://localhost:4096/api");
    expect(candidates.length).toBeGreaterThan(1);
    expect(candidates).toContain("http://localhost:4096/api");
    expect(candidates).toContain("http://127.0.0.1:4096/api");
  });

  it("should return single candidate for non-local URLs", () => {
    const candidates = host.buildFetchCandidates("https://example.com/api");
    expect(candidates).toEqual(["https://example.com/api"]);
  });

  it("should determine color scheme based on theme", () => {
    // Light theme = kind 1
    expect(host.getColorScheme()).toBe("light");
  });

  it("should abort fetches by request ID", () => {
    const abortSpy = vi.fn();
    const mockAbortController = { abort: abortSpy, signal: { aborted: false } };

    // Inject the mock controller manually
    (host as unknown as Record<string, unknown>).fetches = new Map([["req-1", mockAbortController as unknown as AbortController]]);

    host.abortFetch("req-1");
    expect(abortSpy).toHaveBeenCalled();
  });

  it("should validate extension settings", async () => {
    await expect(host.setExtensionSetting("opencodePath", 123 as unknown as string)).rejects.toThrow(
      "Invalid value for opencodePath",
    );
    await expect(host.setExtensionSetting("autoStartServer", "true" as unknown as boolean)).rejects.toThrow(
      "Invalid value for autoStartServer",
    );
  });

  it("should get native settings with defaults", () => {
    const settings = host.getNativeSettings();
    expect(settings.language).toBe("auto");
    expect(settings.fontSize).toBe(14);
    expect(settings.autoSave).toBe(true);
    expect(settings.soundAgent).toBe("staplebops-01");
  });
});
