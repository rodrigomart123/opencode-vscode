# OpenCode VS Code

OpenCode VS Code brings OpenCode sessions into a native VS Code sidebar experience.

Repository: `https://github.com/rodrigomart123/opencode-vscode`

## Features

- OpenCode chat and session workflow directly in the Activity Bar sidebar
- Uses the active workspace folder as the OpenCode working directory
- Connects to existing OpenCode server, with optional auto-start local server
- Preserves sidebar context while switching files in the same workspace
- Quick commands for New Session, Refresh, Settings, and Restart Local Server

## Requirements

- VS Code `1.96.0` or newer
- OpenCode CLI available as `opencode` in PATH, or set `opencodeVisual.opencodePath`

## Extension Settings

- `opencodeVisual.opencodePath`: CLI command or absolute path for OpenCode
- `opencodeVisual.serverBaseUrl`: base URL for OpenCode server
- `opencodeVisual.autoStartServer`: auto-run `opencode serve` when needed (default: `true`)
- `opencodeVisual.debugServerLogs`: stream server logs to output channel

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
code --install-extension .\opencode-vscode-0.1.0.vsix --force
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
