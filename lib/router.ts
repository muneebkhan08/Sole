import { AGENT_IDS, PLATFORM_IDS } from "./types";
import type { AgentId, PlatformId, Roster } from "./types";

/** Pipeline order. Index is the stage number: scrapper 0 → poster 3. */
const STAGE: AgentId[] = ["scrapper", "analyzer", "planner", "poster"];

const STAGE_PATTERNS: Record<AgentId, RegExp[]> = {
  scrapper: [
    /\bscrap(e|ing|er)\b/,
    /\bcollect(ing|ed)?\b/,
    /\bgather(ing|ed)?\b/,
    /\bpull(ing|ed)?\b/,
    /\bfetch(ing|ed)?\b/,
    /\bcrawl(ing|ed)?\b/,
    /\bmonitor(ing|ed)?\b/,
    /\btrack(ing|ed)?\b/,
    /\bsearch(ing|ed)?\b/,
    /\bfind\b/,
    /\blook up\b/,
    /\bdata\b/,
    /\bdataset\b/,
    /\bsignals?\b/,
    /\bposts?\b/,
    /\bcomments?\b/,
    /\bthreads?\b/,
    /\bmentions?\b/,
    /\bwhat('| i)s (trending|happening|hot)\b/,
    /\btrending\b/,
    /\bcompetitor\b/,
    /\bspreadsheet\b/,
    /\bexcel\b/,
    /\bcsv\b/,
  ],
  analyzer: [
    /\banaly(ze|se|sis|zing|sing|tics)\b/,
    /\btrends?\b/,
    /\bsentiment\b/,
    /\binsights?\b/,
    /\bhooks?\b/,
    /\bpatterns?\b/,
    /\bthemes?\b/,
    /\bangles?\b/,
    /\bbreak ?down\b/,
    /\bcompare\b/,
    /\bsummar(y|ize|ise)\b/,
    /\bwhy\b/,
    /\bwhat (does|do) (it|they) mean\b/,
  ],
  planner: [
    /\bplan(ning|ned)?\b/,
    /\bcampaign\b/,
    /\bcalendar\b/,
    /\bschedule\b/,
    /\bstrateg(y|ic)\b/,
    /\broadmap\b/,
    /\bcadence\b/,
    /\b\d+\s*-?\s*day\b/,
    /\b\d+\s*-?\s*week\b/,
  ],
  poster: [
    /\bwrite\b/,
    /\bdraft(ing|s|ed)?\b/,
    /\bcop(y|ywriting)\b/,
    /\bcaptions?\b/,
    /\bheadlines?\b/,
    /\bqueue\b/,
    /\bpublish\b/,
    /\brewrite\b/,
    /\bhumanize\b/,
    /\bde-?slop\b/,
    /\bpost (this|it|these)\b/,
  ],
};

const PLATFORM_PATTERNS: Record<PlatformId, RegExp[]> = {
  reddit: [/\breddit\b/, /\br\/\w+/, /\bsubreddit\b/],
  facebook: [/\bfacebook\b/, /\bfb\b/, /\bmeta pages?\b/],
  instagram: [/\binstagram\b/, /\big\b/, /\breels?\b/, /\bcarousels?\b/],
};

/** "don't plan it", "skip the analysis" — drop a stage the brief rules out. */
const EXCLUDE_PATTERNS: Record<AgentId, RegExp> = {
  scrapper: /\b(do ?n'?t|no need to|skip( the)?|without)\s+(scrap\w*|collect\w*|gather\w*|research\w*)/,
  analyzer: /\b(do ?n'?t|no need to|skip( the)?|without)\s+(analy\w*)/,
  planner: /\b(do ?n'?t|no need to|skip( the)?|without)\s+(plan\w*|campaign\w*)/,
  poster: /\b(do ?n'?t|no need to|skip( the)?|without)\s+(writ\w*|draft\w*|post\w*)/,
};

/** "analyze the data we already have" — the upstream stage already happened. */
const HAS_UPSTREAM_DATA =
  /\b(already|existing|previous(ly)?|earlier|these results|that data|the data (we|you) (have|collected|pulled))\b/;

function hits(text: string, patterns: RegExp[]): boolean {
  return patterns.some((re) => re.test(text));
}

function list(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/**
 * Decide which agents a brief actually needs.
 *
 * Follows the contract in architecture.md: the pipeline runs in order unless the
 * brief names a single role, in which case only that role works. Naming several
 * roles spans from the shallowest to the deepest so intermediate stages still
 * run ("draft posts from reddit trends" needs the scrape and the analysis too).
 */
export function routeTask(message: string): Roster {
  const text = message.toLowerCase();

  let matched = STAGE.filter((id) => hits(text, STAGE_PATTERNS[id]));
  const platforms = PLATFORM_IDS.filter((id) => hits(text, PLATFORM_PATTERNS[id]));

  if (matched.length === 0) {
    return {
      agents: [...AGENT_IDS],
      platforms,
      scope: "pipeline",
      reason: "No explicit scope in the brief — running the full pipeline.",
      wantsData: true,
    };
  }

  // Work already done upstream means the collector does not need to run again.
  const reusing = HAS_UPSTREAM_DATA.test(text);
  if (reusing && matched.length > 1) {
    matched = matched.filter((id) => id !== "scrapper");
  }

  // Honour explicit opt-outs, but never let them empty the roster.
  const excluded = STAGE.filter((id) => EXCLUDE_PATTERNS[id].test(text));
  const kept = matched.filter((id) => !excluded.includes(id));
  if (kept.length > 0) matched = kept;

  let agents: AgentId[];
  let reason: string;

  if (matched.length === 1) {
    agents = [...matched];
    reason = reusing
      ? `Working from data already on hand — ${label(agents[0])} only.`
      : `Only ${label(agents[0])} is needed for this brief.`;
  } else {
    const first = Math.min(...matched.map((id) => STAGE.indexOf(id)));
    const last = Math.max(...matched.map((id) => STAGE.indexOf(id)));
    agents = STAGE.slice(first, last + 1).filter(
      (id) => !excluded.includes(id) || matched.includes(id),
    );
    reason = `Runs ${agents.map(label).join(" \u2192 ")}.`;
    if (excluded.length) {
      reason += ` Skipping ${list(excluded.map(label))}.`;
    }
  }

  return {
    agents,
    platforms,
    scope: agents.length === 1 ? "single" : "pipeline",
    reason,
    wantsData: agents.includes("scrapper"),
  };
}

function label(id: AgentId): string {
  return id.charAt(0).toUpperCase() + id.slice(1);
}

export function isAssigned(roster: Roster, id: AgentId): boolean {
  return roster.agents.includes(id);
}
