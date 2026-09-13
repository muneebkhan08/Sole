import type {
  AgentId,
  PlatformId,
  Roster,
  RunUsage,
  Signal,
  SoleEvent,
  ToolCall,
} from "./types";
import {
  mapTextToPlatform,
  mapToolToAgent,
  parseSoleTags,
  takeCompleteLines,
} from "./tool-map";
import { parseSignal } from "./signals";
import { sseEncode, type SseFrame } from "./sse";

function asRecord(data: unknown): Record<string, unknown> {
  return data && typeof data === "object" ? (data as Record<string, unknown>) : {};
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** Tool args arrive as an object; flatten to something a cell can hold. */
function flattenArgs(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value === "string") return value.trim() || undefined;
  try {
    const json = JSON.stringify(value);
    return json && json !== "{}" && json !== "null" ? json : undefined;
  } catch {
    return undefined;
  }
}

export type BridgeAcc = {
  taskId: string;
  roster: Roster;
  text: string;
  /** Offset into `text` already handed to the tag parser. */
  consumed: number;
  seenNotify: Set<string>;
  signals: Signal[];
  malformed: { raw: string; error: string }[];
  tools: ToolCall[];
  usage?: RunUsage;
  transcript: string;
  model?: string;
  /** Last agent named by an explicit [[agent:]] tag. */
  active?: AgentId;
};

export function createAcc(taskId: string, roster: Roster): BridgeAcc {
  return {
    taskId,
    roster,
    text: "",
    consumed: 0,
    seenNotify: new Set(),
    signals: [],
    malformed: [],
    tools: [],
    transcript: "",
  };
}

/** Keep an agent attribution inside the routed roster. */
function onRoster(acc: BridgeAcc, agent: AgentId): AgentId {
  if (acc.roster.agents.includes(agent)) return agent;
  if (acc.active && acc.roster.agents.includes(acc.active)) return acc.active;
  return acc.roster.agents[0] ?? agent;
}

function idleLine(agent: AgentId): string {
  switch (agent) {
    case "scrapper":
      return "Waiting for a brief";
    case "analyzer":
      return "Watching the floor";
    case "planner":
      return "Board is clear";
    default:
      return "Queue is empty";
  }
}

/** Handle tagged lines found in a completed chunk of assistant text. */
function drainTags(acc: BridgeAcc, chunk: string, events: SoleEvent[]) {
  for (const hit of parseSoleTags(chunk)) {
    if (hit.signal) {
      const parsed = parseSignal(hit.signal, {
        tool: acc.tools[acc.tools.length - 1]?.name,
        seq: acc.tools[acc.tools.length - 1]?.seq,
      });
      if (parsed.ok) {
        acc.signals.push(parsed.signal);
        events.push({
          type: "signal",
          taskId: acc.taskId,
          count: acc.signals.length,
          latest: parsed.signal.title ?? parsed.signal.url,
        });
      } else {
        acc.malformed.push({ raw: parsed.raw, error: parsed.error });
      }
      continue;
    }

    if (hit.agent) {
      // An agent the router benched can still join if the model hands it work.
      if (!acc.roster.agents.includes(hit.agent)) {
        acc.roster.agents.push(hit.agent);
      }
      acc.active = hit.agent;
      events.push({
        type: "agent.status",
        agent: hit.agent,
        status: "working",
        line: hit.line || "On it",
        platform: hit.platform,
      });
    }

    if (hit.notify && !acc.seenNotify.has(hit.notify)) {
      acc.seenNotify.add(hit.notify);
      events.push({
        type: "notify",
        title: hit.agent ? `${hit.agent} update` : "Floor update",
        body: hit.notify,
        agent: hit.agent,
        platform: hit.platform,
      });
    }
  }
}

export function hermesFrameToSole(
  frame: SseFrame,
  acc: BridgeAcc,
): SoleEvent[] {
  const events: SoleEvent[] = [];
  const payload = asRecord(frame.data);
  const event = frame.event;
  const seq = num(payload.seq);
  const ts = num(payload.ts);

  if (event === "run.started") {
    const runtime = asRecord(payload.runtime);
    acc.model = str(runtime.model) || undefined;
    // Only the agents this brief actually needs come off their pads.
    for (const agent of acc.roster.agents) {
      events.push({
        type: "agent.status",
        agent,
        status: "listening",
        line: agent === acc.roster.agents[0] ? "Reading the brief" : "Standing by",
      });
    }
    return events;
  }

  if (event === "assistant.delta") {
    const delta = str(payload.delta);
    if (!delta) return events;
    acc.text += delta;
    events.push({ type: "assistant.delta", text: delta });

    // Parse complete lines only, exactly once each. A half-streamed
    // [[signal]] line is not valid JSON and would corrupt the workbook.
    const { chunk, consumed } = takeCompleteLines(acc.text, acc.consumed);
    acc.consumed = consumed;
    if (chunk) drainTags(acc, chunk, events);
    return events;
  }

  if (event === "tool.started" || event === "tool.completed" || event === "tool.failed") {
    const name = str(payload.tool_name) || "tool";
    // Hermes sends preview/args on tool.started only; both are null on
    // completion, so carry the started values forward for the ledger.
    const preview = str(payload.preview);
    const args = flattenArgs(payload.args);
    // Tool-name mapping is a heuristic, so it must not override the router:
    // a generic tool (terminal, write_file) attributed to an off-roster agent
    // is credited to whoever is actually working instead.
    const agent = onRoster(acc, mapToolToAgent(name));
    const phase = event.slice("tool.".length) as ToolCall["phase"];
    const prior = [...acc.tools].reverse().find((t) => t.name === name);
    const platform =
      mapTextToPlatform(`${name} ${preview} ${args ?? ""}`) ??
      (phase !== "started" ? prior?.platform : undefined);

    const call: ToolCall = {
      seq: seq ?? acc.tools.length + 1,
      at: ts != null ? ts * 1000 : Date.now(),
      agent,
      name,
      phase,
      args: args ?? (phase !== "started" ? prior?.args : undefined),
      preview: preview || (phase !== "started" ? prior?.preview : undefined),
      platform,
    };
    acc.tools.push(call);

    events.push({
      type: "tool",
      agent,
      name,
      phase,
      preview: call.preview,
      args: call.args,
      seq: call.seq,
      platform,
    });
    events.push({
      type: "agent.status",
      agent,
      status: phase === "failed" ? "idle" : "working",
      line:
        phase === "started"
          ? `Using ${name}`
          : phase === "failed"
            ? `${name} failed`
            : `Finished ${name}`,
      platform,
    });
    return events;
  }

  if (event === "assistant.completed") {
    const content = str(payload.content) || acc.text;
    // Flush whatever tail never got a trailing newline.
    if (acc.consumed < content.length) {
      drainTags(acc, content.slice(acc.consumed), events);
      acc.consumed = content.length;
    }
    acc.transcript = content;
    for (const agent of acc.roster.agents) {
      events.push({
        type: "agent.status",
        agent,
        status: "done",
        line: "Done",
      });
    }
    events.push({ type: "assistant.done", text: content });
    return events;
  }

  if (event === "run.completed") {
    const usage = asRecord(payload.usage);
    acc.usage = {
      inputTokens: num(usage.input_tokens) ?? num(usage.prompt_tokens),
      outputTokens: num(usage.output_tokens) ?? num(usage.completion_tokens),
      totalTokens: num(usage.total_tokens),
      costUsd: num(usage.cost_usd),
    };
    if (!acc.transcript) {
      const messages = Array.isArray(payload.messages) ? payload.messages : [];
      acc.transcript = messages
        .map((m) => str(asRecord(m).content))
        .filter(Boolean)
        .join("\n\n");
    }
    return events;
  }

  if (event === "done") {
    for (const agent of acc.roster.agents) {
      events.push({
        type: "agent.status",
        agent,
        status: "done",
        line: "Returned to pad",
      });
    }
    return events;
  }

  if (event === "error") {
    events.push({
      type: "error",
      message: str(payload.message) || "Hermes run failed",
    });
  }

  return events;
}

export function encodeSoleEvent(event: SoleEvent): string {
  return sseEncode(event.type, event);
}

export function guessPlatformFromTask(message: string): PlatformId | undefined {
  return mapTextToPlatform(message);
}

export { idleLine };
