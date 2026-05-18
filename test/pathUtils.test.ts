import { describe, it } from "node:test";
import assert from "node:assert";
import { workspaceKey, sameWorkspace, windowsPath } from "../src/pathUtils";

describe("windowsPath", () => {
  it("detects Windows absolute paths", () => {
    assert.strictEqual(windowsPath("C:/Users/test"), true);
    assert.strictEqual(windowsPath("D:\\\\workspace"), true);
    assert.strictEqual(windowsPath("//server/share"), true);
  });

  it("returns false for Unix paths", () => {
    assert.strictEqual(windowsPath("/home/user"), false);
    assert.strictEqual(windowsPath("/usr/local/bin"), false);
  });
});

describe("workspaceKey", () => {
  it("normalizes backslashes to forward slashes", () => {
    assert.strictEqual(workspaceKey("C:\\Users\\test"), "C:/Users/test");
  });

  it("trims trailing slashes", () => {
    assert.strictEqual(workspaceKey("/home/user/"), "/home/user");
    assert.strictEqual(workspaceKey("/home/user//"), "/home/user");
  });

  it("handles drive root paths", () => {
    assert.strictEqual(workspaceKey("C:/"), "C:/");
    assert.strictEqual(workspaceKey("C://"), "C:/");
  });

  it("handles Unix root", () => {
    assert.strictEqual(workspaceKey("/"), "/");
    assert.strictEqual(workspaceKey("//"), "/");
  });
});

describe("sameWorkspace", () => {
  it("matches identical paths", () => {
    assert.strictEqual(sameWorkspace("/home/user", "/home/user"), true);
  });

  it("matches paths with different trailing slashes", () => {
    assert.strictEqual(sameWorkspace("/home/user", "/home/user/"), true);
  });

  it("matches paths with different backslash styles", () => {
    assert.strictEqual(sameWorkspace("C:/Users/test", "C:\\Users\\test"), true);
  });

  it("is case-insensitive on Windows", () => {
    assert.strictEqual(sameWorkspace("C:/Users/Test", "c:/users/test"), true);
  });

  it("is case-sensitive on Unix", () => {
    assert.strictEqual(sameWorkspace("/home/User", "/home/user"), false);
  });

  it("returns false for different paths", () => {
    assert.strictEqual(sameWorkspace("/home/user", "/home/other"), false);
  });
});
