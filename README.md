# OpenCode for VSCode

> VS Code sidebar client for [OpenCode](https://opencode.ai) sessions.

[![Version](https://img.shields.io/visual-studio-marketplace/v/rodrigomart123.opencode-for-vscode?color=blue&label=Version)](https://marketplace.visualstudio.com/items?itemName=rodrigomart123.opencode-for-vscode)
[![Installs](https://img.shields.io/visual-studio-marketplace/i/rodrigomart123.opencode-for-vscode?color=green)](https://marketplace.visualstudio.com/items?itemName=rodrigomart123.opencode-for-vscode)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## Features

- **Native sidebar integration** — OpenCode sessions directly in the VS Code Activity Bar
- **Auto-install CLI** — detects and installs OpenCode automatically via npm on first launch
- **Smart PATH resolution** — searches PATH, well-known locations, and login shell fallback
- **Multi-session management** — create, switch, archive, and delete sessions
- **Real-time sync** — live event streaming with automatic reconnection
- **Workspace-aware** — uses the active workspace folder as the OpenCode working directory
- **Open Terminal** — launch an OpenCode CLI terminal from the command palette
- **Configurable** — server URL, auto-start, debug logs, themes, fonts, and more

## Quick Start

1. Install the extension from the [Marketplace](https://marketplace.visualstudio.com/items?itemName=rodrigomart123.opencode-for-vscode)
2. Open a workspace folder
3. The extension will auto-detect or install the OpenCode CLI
4. Start chatting from the sidebar

> **No CLI installed?** The extension will offer to install it automatically via `npm install -g opencode-ai`.

## Requirements

- VS Code `1.96.0` or newer
- Node.js (for auto-install feature)
- OpenCode CLI (auto-installed if missing)

## Commands

| Command | Description |
|---|---|
| `OpenCode: Focus Sidebar` | Focus the OpenCode sidebar view |
| `OpenCode: New Session` | Create a new OpenCode session |
| `OpenCode: Refresh` | Reload sidebar and reconnect |
| `OpenCode: Open Settings` | Open the settings panel |
| `OpenCode: Restart Local Server` | Restart the managed server |
| `OpenCode: Open Terminal` | Open a terminal with the OpenCode CLI |
| `OpenCode: Install CLI` | Manually install/update the OpenCode CLI |

## Configuration

| Setting | Default | Description |
|---|---|---|
| `opencodeVisual.opencodePath` | `opencode` | CLI command or executable path (supports `~`) |
| `opencodeVisual.serverBaseUrl` | `http://127.0.0.1:4096` | Base URL for the OpenCode server |
| `opencodeVisual.autoStartServer` | `true` | Auto-run `opencode serve` when needed |
| `opencodeVisual.debugServerLogs` | `false` | Stream server logs to output channel |

## Troubleshooting

**CLI not found in VS Code but works in terminal:**

VS Code may use a different PATH than your interactive shell. The extension tries multiple strategies, but if auto-detection fails:

1. Run `command -v opencode` (macOS/Linux) or `Get-Command opencode` (Windows)
2. Copy the full path into `opencodeVisual.opencodePath` in settings

**View diagnostics:**
`View` → `Output` → select `OpenCode for VSCode` from the dropdown

## Install from VSIX

```bash
npm install
npm run build
npx vsce package
code --install-extension ./opencode-for-vscode-<version>.vsix --force
```

Then run `Developer: Reload Window`.

## License

MIT — see [LICENSE](LICENSE.txt) for details.

Third-party attributions in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
