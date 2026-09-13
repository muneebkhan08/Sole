export const AGENT_IDS = ["scrapper", "analyzer", "planner", "poster"] as const;
export type AgentId = (typeof AGENT_IDS)[number];

export const PLATFORM_IDS = ["reddit", "facebook", "instagram"] as const;
export type PlatformId = (typeof PLATFORM_IDS)[number];

export type AgentStatus = "idle" | "listening" | "working" | "done";

export type AgentState = {
  id: AgentId;
  name: string;
  role: string;
  status: AgentStatus;
  line: string;
  platform?: PlatformId;
  /** False when the router left this agent off the roster for the current brief. */
  assigned: boolean;
};

export type ChatRole = "user" | "assistant" | "system";

export type ChatMessage = {
  id: string;
  role: ChatRole;
  text: string;
  at: number;
};

export type NotifyItem = {
  id: string;
  at: number;
  title: string;
  body: string;
  agent?: AgentId;
  platform?: PlatformId;
};

/** One captured item. Rows without a resolvable url land in the Unverified sheet. */
export type Signal = {
  id: string;
  capturedAt: number;
  platform?: PlatformId;
  sourceType?: string;
  title?: string;
  author?: string;
  url?: string;
  postedAt?: string;
  score?: number;
  comments?: number;
  community?: string;
  query?: string;
  excerpt?: string;
  sentiment?: string;
  theme?: string;
  tool?: string;
  seq?: number;
  verified: boolean;
};

export type ToolCall = {
  seq: number;
  at: number;
  agent: AgentId;
  name: string;
  phase: "started" | "completed" | "failed";
  args?: string;
  preview?: string;
  platform?: PlatformId;
};

export type ArtifactKind = "xlsx" | "pdf" | "json";

export type ArtifactRef = {
  kind: ArtifactKind;
  name: string;
  href: string;
  bytes: number;
  rows?: number;
};

export type TaskScope = "single" | "pipeline";

export type Roster = {
  agents: AgentId[];
  platforms: PlatformId[];
  scope: TaskScope;
  reason: string;
  wantsData: boolean;
};

export type RunUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  costUsd?: number;
};

export type RunStatus = "running" | "completed" | "failed";

export type RunManifest = {
  id: string;
  brief: string;
  createdAt: number;
  endedAt?: number;
  status: RunStatus;
  roster: Roster;
  model?: string;
  usage?: RunUsage;
  counts: { signals: number; unverified: number; tools: number; notifications: number };
  artifacts: ArtifactRef[];
  summary?: string;
  error?: string;
};

export type SoleEvent =
  | { type: "task.started"; taskId: string; message: string }
  | {
      type: "task.routed";
      taskId: string;
      agents: AgentId[];
      platforms: PlatformId[];
      scope: TaskScope;
      reason: string;
    }
  | {
      type: "agent.status";
      agent: AgentId;
      status: AgentStatus;
      line: string;
      platform?: PlatformId;
    }
  | {
      type: "notify";
      title: string;
      body: string;
      agent?: AgentId;
      platform?: PlatformId;
    }
  | { type: "assistant.delta"; text: string }
  | { type: "assistant.done"; text: string }
  | {
      type: "tool";
      agent: AgentId;
      name: string;
      phase: "started" | "completed" | "failed";
      preview?: string;
      args?: string;
      seq?: number;
      platform?: PlatformId;
    }
  | { type: "signal"; taskId: string; count: number; latest?: string }
  | { type: "artifact"; taskId: string; artifact: ArtifactRef }
  | { type: "task.done"; taskId: string; text?: string }
  | { type: "error"; message: string };

export type HermesStatus = {
  ok: boolean;
  version?: string;
  error?: string;
};
