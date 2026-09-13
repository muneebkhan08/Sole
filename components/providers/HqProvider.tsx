"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from "react";
import { initialAgents } from "@/lib/agents";
import { readSse } from "@/lib/sse";
import type {
  AgentId,
  AgentState,
  ArtifactRef,
  ChatMessage,
  HermesStatus,
  NotifyItem,
  PlatformId,
  SoleEvent,
  TaskScope,
} from "@/lib/types";

const TOAST_MS = 4200;

type Routing = {
  agents: AgentId[];
  platforms: PlatformId[];
  scope: TaskScope;
  reason: string;
};

type State = {
  hermes: HermesStatus;
  agents: Record<AgentId, AgentState>;
  platforms: Record<PlatformId, { connected: boolean }>;
  messages: ChatMessage[];
  notifications: NotifyItem[];
  toasts: NotifyItem[];
  busy: boolean;
  streaming: string;
  taskId?: string;
  routing?: Routing;
  artifacts: ArtifactRef[];
  signalCount: number;
};

type Action =
  | { type: "status"; hermes: HermesStatus; connected: boolean }
  | { type: "user"; text: string }
  | { type: "event"; event: SoleEvent }
  | { type: "resetIdle" }
  | { type: "pruneToasts"; now: number };

const idleLines: Record<AgentId, string> = {
  scrapper: "Waiting for a brief",
  analyzer: "Watching the floor",
  planner: "Board is clear",
  poster: "Queue is empty",
};

const initial: State = {
  hermes: { ok: false },
  agents: initialAgents(),
  platforms: {
    reddit: { connected: false },
    facebook: { connected: false },
    instagram: { connected: false },
  },
  messages: [
    {
      id: "welcome",
      role: "system",
      at: Date.now(),
      text: "Four agents on the floor. Brief them in the chat — Sole reads the brief and wakes only the agents it needs. Reddit, Facebook, and Instagram only.",
    },
  ],
  notifications: [],
  toasts: [],
  busy: false,
  streaming: "",
  artifacts: [],
  signalCount: 0,
};

function nid() {
  return crypto.randomUUID();
}

function applyEvent(state: State, event: SoleEvent): State {
  switch (event.type) {
    case "task.started":
      return {
        ...state,
        busy: true,
        streaming: "",
        taskId: event.taskId,
        artifacts: [],
        signalCount: 0,
        routing: undefined,
      };

    case "task.routed": {
      const routing: Routing = {
        agents: event.agents,
        platforms: event.platforms,
        scope: event.scope,
        reason: event.reason,
      };
      return {
        ...state,
        routing,
        agents: Object.fromEntries(
          Object.values(state.agents).map((a) => [
            a.id,
            event.agents.includes(a.id)
              ? { ...a, assigned: true, status: "listening" as const, line: "Reading the brief" }
              : { ...a, assigned: false, status: "idle" as const, line: "Not on this brief", platform: undefined },
          ]),
        ) as State["agents"],
      };
    }

    case "agent.status":
      return {
        ...state,
        agents: {
          ...state.agents,
          [event.agent]: {
            ...state.agents[event.agent],
            // An agent the router benched can still be pulled in mid-run.
            assigned: true,
            status: event.status,
            line: event.line,
            platform: event.platform ?? state.agents[event.agent].platform,
          },
        },
      };

    case "notify": {
      const item: NotifyItem = {
        id: nid(),
        at: Date.now(),
        title: event.title,
        body: event.body,
        agent: event.agent,
        platform: event.platform,
      };
      return {
        ...state,
        notifications: [item, ...state.notifications].slice(0, 50),
        toasts: [item, ...state.toasts].slice(0, 4),
      };
    }

    case "tool": {
      const item: NotifyItem = {
        id: nid(),
        at: Date.now(),
        agent: event.agent,
        platform: event.platform,
        title:
          event.phase === "started"
            ? `${event.agent} started ${event.name}`
            : event.phase === "failed"
              ? `${event.name} failed`
              : `${event.agent} finished ${event.name}`,
        body: event.preview || event.args || event.name,
      };
      return {
        ...state,
        notifications: [item, ...state.notifications].slice(0, 50),
        toasts:
          event.phase === "started"
            ? state.toasts
            : [item, ...state.toasts].slice(0, 4),
      };
    }

    case "signal":
      return { ...state, signalCount: event.count };

    case "artifact": {
      const item: NotifyItem = {
        id: nid(),
        at: Date.now(),
        title: event.artifact.kind === "xlsx" ? "Spreadsheet ready" : "Report ready",
        body:
          event.artifact.rows != null
            ? `${event.artifact.name} — ${event.artifact.rows} rows`
            : event.artifact.name,
      };
      return {
        ...state,
        artifacts: [
          ...state.artifacts.filter((a) => a.name !== event.artifact.name),
          event.artifact,
        ],
        notifications: [item, ...state.notifications].slice(0, 50),
        toasts: [item, ...state.toasts].slice(0, 4),
      };
    }

    case "assistant.delta":
      return { ...state, streaming: state.streaming + event.text };

    case "assistant.done":
      return {
        ...state,
        streaming: "",
        messages: [
          ...state.messages,
          { id: nid(), role: "assistant", text: event.text, at: Date.now() },
        ],
      };

    case "task.done": {
      if (!state.streaming) return { ...state, busy: false };
      return {
        ...state,
        busy: false,
        streaming: "",
        messages: [
          ...state.messages,
          { id: nid(), role: "assistant", text: state.streaming, at: Date.now() },
        ],
      };
    }

    case "error":
      return {
        ...state,
        busy: false,
        streaming: "",
        messages: [
          ...state.messages,
          { id: nid(), role: "system", text: event.message, at: Date.now() },
        ],
      };

    default:
      return state;
  }
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "status":
      return {
        ...state,
        hermes: action.hermes,
        platforms: {
          reddit: { connected: action.connected },
          facebook: { connected: action.connected },
          instagram: { connected: action.connected },
        },
      };
    case "user":
      return {
        ...state,
        messages: [
          ...state.messages,
          { id: nid(), role: "user", text: action.text, at: Date.now() },
        ],
      };
    case "event":
      return applyEvent(state, action.event);
    case "resetIdle":
      return {
        ...state,
        agents: Object.fromEntries(
          Object.values(state.agents).map((a) => [
            a.id,
            {
              ...a,
              status: "idle" as const,
              assigned: true,
              line: idleLines[a.id],
              platform: undefined,
            },
          ]),
        ) as State["agents"],
      };
    case "pruneToasts": {
      const kept = state.toasts.filter((t) => action.now - t.at < TOAST_MS);
      return kept.length === state.toasts.length ? state : { ...state, toasts: kept };
    }
    default:
      return state;
  }
}

type Ctx = State & {
  send: (text: string) => Promise<void>;
};

const HqContext = createContext<Ctx | null>(null);

/**
 * Agent snapshots live in their own context.
 *
 * The main context value changes on every assistant.delta — i.e. per streamed
 * token — and the WebGL tree consumes it. Splitting the floor state out means
 * the 3D scene only re-renders when an agent actually moves, instead of
 * reconciling the whole R3F tree at token rate.
 */
const HqAgentsContext = createContext<Record<AgentId, AgentState> | null>(null);

export function HqProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initial);

  useEffect(() => {
    let alive = true;
    const pull = async () => {
      try {
        const res = await fetch("/api/status", { cache: "no-store" });
        const data = await res.json();
        if (!alive) return;
        dispatch({
          type: "status",
          hermes: data.hermes,
          connected: Boolean(data.hermes?.ok),
        });
      } catch {
        if (!alive) return;
        dispatch({
          type: "status",
          hermes: { ok: false, error: "status failed" },
          connected: false,
        });
      }
    };
    pull();
    const id = setInterval(pull, 8000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    if (state.busy) return;
    const anyDone = Object.values(state.agents).some((a) => a.status === "done");
    if (!anyDone) return;
    const t = setTimeout(() => dispatch({ type: "resetIdle" }), 5000);
    return () => clearTimeout(t);
  }, [state.busy, state.agents]);

  // One sweep, so a burst of toasts cannot keep resetting a shared timer.
  const hasToasts = state.toasts.length > 0;
  useEffect(() => {
    if (!hasToasts) return;
    const id = setInterval(
      () => dispatch({ type: "pruneToasts", now: Date.now() }),
      500,
    );
    return () => clearInterval(id);
  }, [hasToasts]);

  // Guards the submit synchronously: `busy` only flips once the server's
  // task.started round-trips, which is long enough for a double Enter to
  // start two concurrent Hermes turns on the same session.
  const inFlight = useRef(false);

  const send = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || inFlight.current) return;
    inFlight.current = true;
    dispatch({ type: "user", text: trimmed });
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed }),
      });
      if (!res.body) {
        dispatch({
          type: "event",
          event: { type: "error", message: "No stream from Sole backend" },
        });
        return;
      }
      // A 409 still streams a single error frame, so it falls through to the
      // same reader rather than needing its own path.
      for await (const frame of readSse(res.body)) {
        const event = frame.data as SoleEvent;
        if (event && typeof event === "object" && "type" in event) {
          dispatch({ type: "event", event });
        }
      }
    } catch (error) {
      dispatch({
        type: "event",
        event: {
          type: "error",
          message: error instanceof Error ? error.message : "Task failed",
        },
      });
    } finally {
      inFlight.current = false;
    }
  }, []);

  const value = useMemo(() => ({ ...state, send }), [state, send]);

  return (
    <HqContext.Provider value={value}>
      <HqAgentsContext.Provider value={state.agents}>
        {children}
      </HqAgentsContext.Provider>
    </HqContext.Provider>
  );
}

/** Floor-only subscription: re-renders when agents move, not when text streams. */
export function useHqAgents() {
  const ctx = useContext(HqAgentsContext);
  if (!ctx) throw new Error("useHqAgents must be used inside HqProvider");
  return ctx;
}

export function useHq() {
  const ctx = useContext(HqContext);
  if (!ctx) throw new Error("useHq must be used inside HqProvider");
  return ctx;
}
