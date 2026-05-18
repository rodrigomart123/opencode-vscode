export const window = {
  activeColorTheme: { kind: 1 },
  createOutputChannel: () => ({ appendLine: () => {}, show: () => {}, dispose: () => {} }),
  showErrorMessage: () => Promise.resolve(undefined),
  showInformationMessage: () => Promise.resolve(undefined),
  showWarningMessage: () => Promise.resolve(undefined),
  createTerminal: () => ({ sendText: () => {}, show: () => {} }),
  showOpenDialog: () => Promise.resolve(undefined),
  activeTextEditor: undefined,
};

export const workspace = {
  getConfiguration: () => ({
    get: (key: string, defaultValue?: unknown) => defaultValue,
    update: () => Promise.resolve(),
  }),
  workspaceFolders: undefined,
  getWorkspaceFolder: () => undefined,
  asRelativePath: (uri: unknown) => String(uri),
  openTextDocument: () => Promise.resolve({}),
  registerTextDocumentContentProvider: () => ({ dispose: () => {} }),
  onDidCloseTextDocument: () => ({ dispose: () => {} }),
};

export const Uri = {
  parse: (url: string) => ({ toString: () => url }),
  file: (path: string) => ({ fsPath: path, toString: () => path }),
  joinPath: (...parts: string[]) => ({ toString: () => parts.join("/") }),
  from: (obj: Record<string, unknown>) => ({ ...obj, toString: () => obj.path || "" }),
};

export const ConfigurationTarget = {
  Global: 1,
  Workspace: 2,
  WorkspaceFolder: 3,
};

export const ColorThemeKind = {
  Light: 1,
  Dark: 2,
  HighContrast: 3,
  HighContrastLight: 4,
};

export const ViewColumn = {
  Active: -1,
  Beside: -2,
};

export const TextEditorRevealType = {
  InCenter: 2,
};

export const Selection = class {};
export const Position = class {};
export const Range = class {};

export const commands = {
  executeCommand: () => Promise.resolve(),
};

export const env = {
  openExternal: () => Promise.resolve(true),
};

export const EventEmitter = class {
  event = () => ({ dispose: () => {} });
  fire = () => {};
  dispose = () => {};
};

export const Disposable = {
  from: (...disposables: Array<{ dispose: () => void }>) => ({
    dispose: () => disposables.forEach((d) => d.dispose()),
  }),
};

export const Event = class {};
