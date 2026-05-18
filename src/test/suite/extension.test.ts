import * as assert from "assert";
import * as vscode from "vscode";
import { workspaceKey, sameWorkspace } from "../../pathUtils";

suite("Extension Activation", () => {
  test("Extension should be present", () => {
    const extension = vscode.extensions.getExtension("rodrigomart123.opencode-for-vscode");
    assert.ok(extension);
  });

  test("Extension should activate", async () => {
    const extension = vscode.extensions.getExtension("rodrigomart123.opencode-for-vscode");
    if (!extension) {
      assert.fail("Extension not found");
      return;
    }
    await extension.activate();
    assert.strictEqual(extension.isActive, true);
  });

  test("Commands should be registered", async () => {
    const commands = await vscode.commands.getCommands(true);
    const opencodeCommands = commands.filter((cmd) => cmd.startsWith("opencodeVisual."));
    assert.ok(opencodeCommands.length > 0, "No opencodeVisual commands found");
    assert.ok(opencodeCommands.includes("opencodeVisual.focus"));
    assert.ok(opencodeCommands.includes("opencodeVisual.newSession"));
    assert.ok(opencodeCommands.includes("opencodeVisual.switchSession"));
  });
});

suite("Path Utilities", () => {
  test("workspaceKey normalizes paths", () => {
    assert.strictEqual(workspaceKey("/home/user/"), "/home/user");
    assert.strictEqual(workspaceKey("C:/"), "C:/");
  });

  test("sameWorkspace handles trailing slashes", () => {
    assert.strictEqual(sameWorkspace("/home/user", "/home/user/"), true);
  });

  test("sameWorkspace is case-insensitive on Windows", () => {
    assert.strictEqual(sameWorkspace("C:/Users/Test", "c:/users/test"), true);
  });

  test("sameWorkspace is case-sensitive on Unix", () => {
    assert.strictEqual(sameWorkspace("/home/User", "/home/user"), false);
  });
});

suite("Configuration", () => {
  test("Default settings exist", () => {
    const config = vscode.workspace.getConfiguration("opencodeVisual");
    const serverBaseUrl = config.get<string>("serverBaseUrl");
    assert.strictEqual(serverBaseUrl, "http://127.0.0.1:4096");
  });
});
