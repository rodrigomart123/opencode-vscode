import { describe, expect, it, vi, beforeEach } from "vitest";
import { OpenCodeService, sameWorkspace, workspaceKey, windowsPath } from "../opencodeService";
import * as vscode from "vscode";

// Use the manual mock for vscode
vi.mock("vscode", () => import("../__mocks__/vscode"));

describe("windowsPath", () => {
  it("detects Windows drive paths", () => {
    expect(windowsPath("C:/foo")).toBe(true);
    expect(windowsPath("D:\\foo")).toBe(true);
    expect(windowsPath("//server/share")).toBe(true);
  });

  it("rejects Unix paths", () => {
    expect(windowsPath("/foo/bar")).toBe(false);
    expect(windowsPath("./foo")).toBe(false);
    expect(windowsPath("foo/bar")).toBe(false);
  });
});

describe("workspaceKey", () => {
  it("normalizes backslashes to forward slashes", () => {
    expect(workspaceKey("C:\\Users\\test")).toBe("C:/Users/test");
  });

  it("handles drive-only paths", () => {
    expect(workspaceKey("C:///")).toBe("C:/");
    expect(workspaceKey("C:/")).toBe("C:/");
  });

  it("handles root paths", () => {
    expect(workspaceKey("/")).toBe("/");
    expect(workspaceKey("///")).toBe("/");
  });

  it("trims trailing slashes", () => {
    expect(workspaceKey("/foo/bar/")).toBe("/foo/bar");
    expect(workspaceKey("/foo/bar///")).toBe("/foo/bar");
  });

  it("leaves clean paths untouched", () => {
    expect(workspaceKey("/foo/bar")).toBe("/foo/bar");
    expect(workspaceKey("C:/Projects/app")).toBe("C:/Projects/app");
  });
});

describe("sameWorkspace", () => {
  it("matches identical Unix paths", () => {
    expect(sameWorkspace("/foo/bar", "/foo/bar")).toBe(true);
  });

  it("matches identical Windows paths case-insensitively", () => {
    expect(sameWorkspace("C:/Projects/App", "c:/projects/app")).toBe(true);
  });

  it("matches paths with different trailing slashes", () => {
    expect(sameWorkspace("/foo/bar", "/foo/bar/")).toBe(true);
  });

  it("matches paths with different backslash styles", () => {
    expect(sameWorkspace("C:/foo/bar", "C:\\foo\\bar")).toBe(true);
  });

  it("rejects different paths", () => {
    expect(sameWorkspace("/foo/bar", "/foo/baz")).toBe(false);
    expect(sameWorkspace("C:/foo", "D:/foo")).toBe(false);
  });
});

describe("OpenCodeService", () => {
  let service: OpenCodeService;

  beforeEach(() => {
    const mockContext = {
      extensionUri: { fsPath: "/ext" },
      extension: { packageJSON: { version: "0.0.1" } },
      workspaceState: {
        get: vi.fn(),
        update: vi.fn(),
      },
      subscriptions: [],
    } as unknown as vscode.ExtensionContext;

    service = new OpenCodeService(mockContext);
  });

  describe("getWorkspaceContext", () => {
    it("returns no workspace when no folders are open", () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (vscode.workspace as any).workspaceFolders = undefined;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (vscode.window as any).activeTextEditor = undefined;

      const result = service.getWorkspaceContext();
      expect(result.hasWorkspace).toBe(false);
      expect(result.name).toBe("No workspace");
    });

    it("returns the active workspace folder from the active editor", () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (vscode.workspace as any).workspaceFolders = [
        { name: "folder1", uri: { fsPath: "/home/user/folder1" } },
        { name: "folder2", uri: { fsPath: "/home/user/folder2" } },
      ];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (vscode.workspace as any).getWorkspaceFolder = () => ({
        name: "folder2",
        uri: { fsPath: "/home/user/folder2" },
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (vscode.window as any).activeTextEditor = {
        document: { uri: { fsPath: "/home/user/folder2/file.ts" } },
      };

      const result = service.getWorkspaceContext();
      expect(result.hasWorkspace).toBe(true);
      expect(result.name).toBe("folder2");
      expect(result.directory).toBe("/home/user/folder2");
    });

    it("falls back to the first workspace folder when no editor is active", () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (vscode.workspace as any).workspaceFolders = [
        { name: "folder1", uri: { fsPath: "/home/user/folder1" } },
      ];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (vscode.window as any).activeTextEditor = undefined;

      const result = service.getWorkspaceContext();
      expect(result.hasWorkspace).toBe(true);
      expect(result.name).toBe("folder1");
      expect(result.directory).toBe("/home/user/folder1");
    });
  });

  describe("dispose", () => {
    it("cleans up without throwing", () => {
      expect(() => service.dispose()).not.toThrow();
    });
  });
});
