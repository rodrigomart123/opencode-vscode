import type {
  Command,
  Config,
  FileDiff,
  FilePartInput,
  Message,
  Part,
  Permission,
  Session,
  SessionStatus,
  Todo,
} from "@opencode-ai/sdk";
import type { Agent, Project, VcsInfo } from "@opencode-ai/sdk/v2";

export type ThreadEntry = {
  info: Message;
  parts: Part[];
};

export type ModelOption = {
  providerID: string;
  modelID: string;
  label: string;
  providerName: string;
  status?: string;
  variants?: string[];
};

export type ProviderOption = {
  id: string;
  name: string;
  modelCount: number;
  defaultModelID?: string;
};

export type ComposerSelection = {
  providerID?: string;
  modelID?: string;
  agent?: string;
  variant?: string | null;
};

export type SidebarState = {
  connection: {
    status: "connecting" | "connected" | "error";
    baseUrl: string;
    managed: boolean;
    error?: string;
  };
  lastError?: string;
  workspace: {
    hasWorkspace: boolean;
    name: string;
    directory?: string;
  };
  sessions: Session[];
  sessionStatuses: Record<string, SessionStatus>;
  activeSessionId?: string;
  thread: ThreadEntry[];
  permissions: Permission[];
  todos: Todo[];
  diffs: FileDiff[];
  commands: Command[];
  agents: Agent[];
  providers: ProviderOption[];
  models: ModelOption[];
  composer: ComposerSelection;
  vcs?: VcsInfo;
  project?: Project | null;
  config: {
    model?: Config["model"];
    smallModel?: Config["small_model"];
  };
};

export type ComposerAttachmentPayload = {
  label: string;
  attachment: FilePartInput;
};

export type WebviewToExtensionMessage =
  | { type: "ready" }
  | { type: "refresh" }
  | { type: "openSettings" }
  | { type: "newSession" }
  | { type: "selectSession"; sessionId: string }
  | { type: "deleteSession"; sessionId: string }
  | { type: "renameSession"; sessionId: string; title: string }
  | { type: "archiveSession"; sessionId: string }
  | {
      type: "sendPrompt";
      text: string;
      attachments: FilePartInput[];
    }
  | {
      type: "setComposerConfig";
      composer: ComposerSelection;
    }
  | {
      type: "replyPermission";
      sessionId: string;
      permissionId: string;
      response: "once" | "always" | "reject";
    }
  | { type: "abortSession"; sessionId: string }
  | { type: "shareSession"; sessionId: string }
  | { type: "unshareSession"; sessionId: string }
  | { type: "copyShareUrl"; url: string }
  | { type: "revertSession"; sessionId: string }
  | { type: "unrevertSession"; sessionId: string }
  | { type: "summarizeSession"; sessionId: string }
  | { type: "runInit"; sessionId: string }
  | {
      type: "openFile";
      filePath: string;
      range?: {
        startLine: number;
        startCharacter: number;
        endLine: number;
        endCharacter: number;
      };
    }
  | {
      type: "openDiff";
      filePath: string;
      before: string;
      after: string;
    }
  | { type: "attachCurrentFile" }
  | { type: "attachImage" }
  | { type: "attachSelection" }
  | { type: "insertCommand"; command: string };

export type ExtensionToWebviewMessage =
  | { type: "state"; state: SidebarState }
  | { type: "composerAttachment"; payload: ComposerAttachmentPayload }
  | { type: "insertText"; text: string };
