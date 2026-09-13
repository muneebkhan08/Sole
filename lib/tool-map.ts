import type { AgentId, PlatformId } from "./types";

const SCRAPE_TOOLS = [
  "web_search",
  "web_extract",
  "browser",
  "browser_navigate",
  "browser_snapshot",
  "fetch",
  "http_request",
  "scrape",
  "list_accounts",
  "account_status",
];

const ANALYZE_TOOLS = [
  "get_metrics",
  "recall_memory",
  "record_analyst_brief",
  "code_execution",
  "execute_code",
];

// write_file / edit_file are deliberately absent: they are generic, and any
// agent saving its output would otherwise be misattributed to the Planner.
const PLAN_TOOLS = [
  "upsert_campaign",
  "list_campaigns",
  "upsert_action_plan",
  "list_action_plans",
];

const POST_TOOLS = [
  "queue_draft",
  "approve_post",
  "publish_post",
  "adapt_action_plan",
];

export function mapToolToAgent(name: string): AgentId {
  const n = name.toLowerCase();
  if (POST_TOOLS.some((t) => n.includes(t))) return "poster";
  if (PLAN_TOOLS.some((t) => n.includes(t))) return "planner";
  if (ANALYZE_TOOLS.some((t) => n.includes(t))) return "analyzer";
  if (SCRAPE_TOOLS.some((t) => n.includes(t))) return "scrapper";
  if (n.includes("search") || n.includes("browse") || n.includes("read")) {
    return "scrapper";
  }
  if (n.includes("publish") || n.includes("draft") || n.includes("post")) {
    return "poster";
  }
  if (n.includes("plan") || n.includes("campaign")) return "planner";
  if (n.includes("metric") || n.includes("analy")) return "analyzer";
  return "scrapper";
}

export function mapTextToPlatform(text: string): PlatformId | undefined {
  const t = text.toLowerCase();
  if (/\breddit\b/.test(t) || /\br\/\w+/.test(t)) return "reddit";
  if (/\binstagram\b/.test(t) || /\big\b/.test(t)) return "instagram";
  if (/\bfacebook\b/.test(t) || /\bfb\b/.test(t)) return "facebook";
  return undefined;
}

export type TagHit = {
  agent?: AgentId;
  platform?: PlatformId;
  notify?: string;
  line?: string;
  /** Raw JSON body of a [[signal]] line, shaped later by lib/signals. */
  signal?: string;
};

// Deliberately non-global: a /g regex carries lastIndex between calls, which
// made these stateful across lines.
const AGENT_RE = /\[\[agent:(scrapper|analyzer|planner|poster)\]\]\s*(.*)$/i;
const PLATFORM_RE = /\[\[platform:(reddit|facebook|instagram)\]\]/i;
const NOTIFY_RE = /\[\[notify\]\]\s*(.+)$/i;
const SIGNAL_RE = /\[\[signal\]\]\s*(\{.*)$/i;

/**
 * Parse tagged status lines out of a chunk of assistant text.
 *
 * Callers must pass COMPLETE lines only. A half-streamed line parses as
 * garbage — harmless for prose tags, but corrupting for [[signal]] JSON.
 */
export function parseSoleTags(chunk: string): TagHit[] {
  const hits: TagHit[] = [];
  for (const raw of chunk.split("\n")) {
    const line = raw.trim();
    if (!line.includes("[[")) continue;
    const hit: TagHit = {};

    const agent = AGENT_RE.exec(line);
    if (agent) {
      hit.agent = agent[1].toLowerCase() as AgentId;
      hit.line = agent[2]?.trim() || undefined;
    }

    const plat = PLATFORM_RE.exec(line);
    if (plat) hit.platform = plat[1].toLowerCase() as PlatformId;

    const note = NOTIFY_RE.exec(line);
    if (note) hit.notify = note[1].trim();

    const signal = SIGNAL_RE.exec(line);
    if (signal) hit.signal = signal[1].trim();

    if (hit.agent || hit.platform || hit.notify || hit.signal) hits.push(hit);
  }
  return hits;
}

/**
 * Split accumulated stream text into the complete lines not yet parsed, and the
 * offset to resume from. Each line is handed to the parser exactly once, which
 * is what keeps this linear instead of re-scanning the whole buffer per delta.
 */
export function takeCompleteLines(
  text: string,
  consumed: number,
): { chunk: string; consumed: number } {
  const nl = text.lastIndexOf("\n");
  if (nl < consumed) return { chunk: "", consumed };
  return { chunk: text.slice(consumed, nl), consumed: nl + 1 };
}

/**
 * Strip machine tags out of assistant text for display.
 *
 * The tags are floor choreography — the agent strip, toasts, activity rail and
 * spreadsheet already render what they carry. Left in the chat they read as
 * noise, and a [[signal]] line dumps raw JSON at the reader.
 */
export function stripSoleTags(text: string): string {
  const lines = text.split("\n").filter((line) => {
    const t = line.trim();
    if (/^\[\[signal\]\]/i.test(t)) return false;
    if (/^\[\[agent:(scrapper|analyzer|planner|poster)\]\]/i.test(t)) return false;
    if (/^\[\[notify\]\]/i.test(t)) return false;
    return true;
  });

  return lines
    .map((line) =>
      line
        .replace(/\[\[(agent|platform):[a-z]+\]\]/gi, "")
        .replace(/\[\[notify\]\]/gi, "")
        .trimEnd(),
    )
    // A tag still arriving mid-stream would otherwise flash as "[[sig".
    .join("\n")
    .replace(/\[\[[^\]\n]*$/, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
