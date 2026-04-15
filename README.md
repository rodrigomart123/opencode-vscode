# OpenCode VS Code

OpenCode VS Code brings OpenCode sessions into a native VS Code sidebar experience.

Repository: `https://github.com/rodrigomart123/opencode-for-vscode`

## Features

- OpenCode chat and session workflow directly in the Activity Bar sidebar
- Uses the active workspace folder as the OpenCode working directory
- Connects to existing OpenCode server, with optional auto-start local server
- Preserves sidebar context while switching files in the same workspace
- Quick commands for New Session, Refresh, Settings, and Restart Local Server

## Requirements

- VS Code `1.96.0` or newer
- OpenCode CLI installed (for example via Homebrew, npm, or curl installer)

Note: VS Code can launch without your interactive shell startup files, so PATH can differ from terminal. The extension now tries PATH, well-known install locations, and login-shell lookup. If auto-detection still fails, set `opencodeVisual.opencodePath` to the full executable path (for example `/opt/homebrew/bin/opencode`, `~/.local/bin/opencode`, or `C:\\Users\\you\\scoop\\shims\\opencode.exe`).

## Extension Settings

- `opencodeVisual.opencodePath`: CLI command or executable path for OpenCode (supports `~`)
- `opencodeVisual.serverBaseUrl`: base URL for OpenCode server
- `opencodeVisual.autoStartServer`: auto-run `opencode serve` when needed (default: `true`)
- `opencodeVisual.debugServerLogs`: stream server logs to output channel

## Troubleshooting CLI detection

- If OpenCode works in terminal but not in VS Code, set `opencodeVisual.opencodePath` to the full executable path.
- macOS/Linux: run `command -v opencode` in terminal and copy that path into settings.
- Windows (PowerShell): run `Get-Command opencode | Select-Object -ExpandProperty Source`.
- Open `View -> Output`, then select `OpenCode VS Code` to inspect server startup diagnostics.

## Commands

- `OpenCode: Focus Sidebar`
- `OpenCode: New Session`
- `OpenCode: Refresh`
- `OpenCode: Open Settings`
- `OpenCode: Restart Local Server`

## Install from VSIX

1. Build and package:

```bash
npm install
npm run build
npx @vscode/vsce package
```

2. Install generated VSIX:

```bash
code --install-extension .\opencode-for-vscode-<version>.vsix --force
```

Then run `Developer: Reload Window`.

## Release and Publishing

This repository is prepared for VS Code Marketplace publication with:

- publisher metadata in `package.json`
- MIT license in root `LICENSE`
- release notes in `CHANGELOG.md`
- third-party attribution in `THIRD_PARTY_NOTICES.md`

## Legal Notes

This extension includes generated webview assets derived from the upstream OpenCode project (`opencode-original`) under MIT terms. See `THIRD_PARTY_NOTICES.md` for attribution.
