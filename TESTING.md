# Testing Guide for OpenCode VS Code Extension

## Upstream Vendoring

The sidebar webview bundles the upstream OpenCode app from `opencode-original/` (gitignored). To fetch it at the pinned commit and apply our patch queue:

```bash
npm run vendor   # = node scripts/vendor-upstream.mjs --apply-patches
```

Rules:

- Never edit files inside `opencode-original/` directly. All changes go through `patches/*.patch`, applied in filename order by the vendor script.
- To create a patch: make the edit in `opencode-original/`, then `cd opencode-original && git diff > ../patches/NNNN-name.patch && git checkout -- .`
- To move to a newer upstream: `node scripts/vendor-upstream.mjs --ref <branch-or-sha> --apply-patches` (updates `UPSTREAM.md`).

## Quick Commands

```bash
# Unit tests (fast, no VS Code needed)
npm run test:unit

# Compile integration tests
npm run test:compile

# Run integration tests (downloads VS Code, opens GUI)
npm run test:integration

# Type check everything
npm run check

# Build extension
npm run build:extension

# Format check
npm run format:check

# Auto-format
npm run format
```

## Testing Levels

### 1. Unit Tests ✅

**Location:** `test/*.test.ts`

**What they test:** Pure utility functions without VS Code dependency

**Run:**
```bash
npm run test:unit
```

**Current coverage:**
- `pathUtils.ts` - Path normalization, workspace comparison, Windows/Unix path handling

**Add new tests:** Create a file in `test/` folder:
```typescript
import { describe, it } from "node:test";
import assert from "node:assert";

describe("my feature", () => {
  it("should work", () => {
    assert.strictEqual(1 + 1, 2);
  });
});
```

### 2. Integration Tests ✅

**Location:** `src/test/suite/*.test.ts`

**What they test:** Extension behavior inside real VS Code

**Run:**
```bash
# First compile
npm run test:compile

# Then run (downloads VS Code automatically)
npm run test:integration
```

**Current coverage:**
- Extension activation
- Command registration
- Configuration defaults
- Path utilities

**Add new tests:** Edit `src/test/suite/extension.test.ts`:
```typescript
import * as assert from "assert";
import * as vscode from "vscode";

suite("My Feature", () => {
  test("command exists", async () => {
    const commands = await vscode.commands.getCommands();
    assert.ok(commands.includes("opencodeVisual.myCommand"));
  });
});
```

### 3. Manual Testing 🖥️

**Option A: VS Code Extension Development Host**

1. Open project in VS Code
2. Press `F5` or go to Run → "Run OpenCode VS Code"
3. A new VS Code window opens with your extension loaded
4. Test the features:
   - Open Command Palette (`Ctrl+Shift+P`) → "OpenCode: Focus Sidebar"
   - Try the new keyboard shortcuts:
     - `Ctrl+Shift+Alt+O` → New Session
     - `Ctrl+Shift+Alt+S` → Switch Session
     - `Ctrl+Shift+Alt+.` → Focus Sidebar
   - Check status bar for connection indicator
   - Test folder picker in settings

**Option B: Install Locally**

```bash
npm run build:extension
# Package as VSIX (optional)
npx vsce package
# Install in VS Code
code --install-extension ./opencode-for-vscode-*.vsix
```

## What to Test for Our Changes

### Phase 1: Shared Bridge + pickDirectory
- [ ] Open sidebar → open settings → verify no console errors
- [ ] Try to pick a directory in settings (if UI supports it)
- [ ] Verify `pickDirectory` returns actual paths instead of `null`

### Phase 2: openFile + Status Bar
- [ ] Status bar shows "$(check) OpenCode" when connected
- [ ] Status bar shows "$(sync~spin) OpenCode" when connecting
- [ ] Status bar shows "$(warning) OpenCode" on error
- [ ] Click status bar → opens sidebar or settings
- [ ] If webview sends `openFile` message, file opens in editor

### Phase 3: Error Logging
- [ ] Open Output panel → "OpenCode for VSCode"
- [ ] Verify errors are logged instead of swallowed
- [ ] CLI install shows progress: "this may take a minute"

### Phase 4: Session Switcher + Shortcuts
- [ ] `Ctrl+Shift+Alt+S` opens QuickPick with sessions
- [ ] Selecting a session switches to it
- [ ] `Ctrl+Shift+Alt+O` creates new session
- [ ] `Ctrl+Shift+Alt+.` focuses sidebar

### Phase 5: Code Quality
- [ ] `npm run format:check` passes
- [ ] `npm run check` passes
- [ ] `npm run test:unit` passes (12 tests)

## Debugging Tests

### Unit Tests
```bash
# Run with verbose output
node --import tsx --test test/**/*.test.ts

# Run specific test file
node --import tsx --test test/pathUtils.test.ts
```

### Integration Tests
```bash
# Compile with source maps
npm run test:compile

# Run with VS Code insiders
node ./out/src/test/runTest.js

# To debug: set breakpoint in src/test/suite/extension.test.ts
# Press F5 in VS Code, select "Run OpenCode VS Code" config
```

### Extension
```bash
# Build with source maps
npm run build:extension

# Press F5 to launch Extension Development Host
# Open Developer Tools in the new window: Help → Toggle Developer Tools
```

## CI Pipeline

GitHub Actions runs on every pull request and on pushes to `main` (`.github/workflows/ci.yml`):

1. `npm ci`
2. `npm run vendor` - pinned upstream checkout + patch queue, cached by `UPSTREAM.md` + `patches/` hash (skipped when the vendor script is absent)
3. `npm run check`
4. `npm run test:unit`
5. `npm run build` (extension + webview)
6. Fails if committed `media/` or `dist/` artifacts differ from a fresh build - rebuild with `npm run build` and commit

## Troubleshooting

**"Cannot find module '@opencode-ai/sdk'"**
- Run `npm install` first
- This is expected in test compilation, types are resolved at runtime

**"VS Code tests timeout"**
- Integration tests download VS Code on first run (~150MB)
- Check internet connection
- Try `npm run test:compile` first

**"Extension not activating"**
- Make sure you built: `npm run build:extension`
- Check that `dist/extension.js` exists
- Open Output panel → "Extension Host" for errors

**"Status bar not showing"**
- Extension must be activated first (open sidebar or run a command)
- Check that workspace folder is open

## Test Files Summary

| File | Type | Purpose |
|------|------|---------|
| `test/pathUtils.test.ts` | Unit | Path normalization utilities |
| `src/test/suite/extension.test.ts` | Integration | Extension activation & commands |
| `src/test/suite/index.ts` | Test Runner | Mocha configuration |
| `src/test/runTest.ts` | Test Runner | VS Code test runner entry |
| `tsconfig.test.json` | Config | TypeScript config for tests |
| `vscode-test.mjs` | Config | VS Code test CLI config |
