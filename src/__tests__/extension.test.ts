import { describe, expect, it, vi } from "vitest";

vi.mock("vscode", () => import("../__mocks__/vscode"));
vi.mock("../opencodeService", async () => {
  const actual = await vi.importActual<typeof import("../opencodeService")>("../opencodeService");
  return {
    ...actual,
    OpenCodeService: vi.fn().mockImplementation(() => ({
      dispose: vi.fn(),
      ensureCliInstalled: vi.fn().mockResolvedValue(true),
      ensureServerReady: vi.fn().mockResolvedValue("http://127.0.0.1:4096"),
      syncWorkspaceContext: vi.fn().mockResolvedValue(false),
      getWorkspaceContext: vi.fn().mockReturnValue({ hasWorkspace: false, name: "No workspace" }),
      getResolvedServerBaseUrl: vi.fn().mockReturnValue("http://127.0.0.1:4096"),
      onDidChangeState: vi.fn().mockReturnValue({ dispose: vi.fn() }),
    })),
  };
});

describe("extension module", () => {
  it("exports activate and deactivate functions", async () => {
    const ext = await import("../extension");
    expect(typeof ext.activate).toBe("function");
    expect(typeof ext.deactivate).toBe("function");
  });
});
