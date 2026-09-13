import { PLATFORM_IDS } from "./types";
import type { PlatformId, Signal } from "./types";

function asString(v: unknown): string | undefined {
  if (typeof v === "string") return v.trim() || undefined;
  if (typeof v === "number") return String(v);
  return undefined;
}

function asNumber(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/[, ]/g, ""));
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function asPlatform(v: unknown): PlatformId | undefined {
  const s = typeof v === "string" ? v.toLowerCase().trim() : "";
  return (PLATFORM_IDS as readonly string[]).includes(s)
    ? (s as PlatformId)
    : undefined;
}

/** A row only counts as verified when we can point at where it came from. */
function isHttpUrl(v: string | undefined): boolean {
  if (!v) return false;
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export type SignalParse =
  | { ok: true; signal: Signal }
  | { ok: false; raw: string; error: string };

/**
 * Shape one [[signal]] JSON body into a row.
 *
 * Tolerant by design: the model will sometimes trail a comma or wrap the object
 * in prose. Anything unsalvageable is quarantined rather than dropped, so the
 * workbook can account for it instead of silently under-reporting.
 */
export function parseSignal(
  body: string,
  ctx: { tool?: string; seq?: number } = {},
): SignalParse {
  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch {
    // Trim anything after the final closing brace and retry once.
    const end = body.lastIndexOf("}");
    if (end < 0) return { ok: false, raw: body, error: "not JSON" };
    try {
      data = JSON.parse(body.slice(0, end + 1));
    } catch {
      return { ok: false, raw: body, error: "malformed JSON" };
    }
  }

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { ok: false, raw: body, error: "not an object" };
  }

  const o = data as Record<string, unknown>;
  const url = asString(o.url ?? o.link ?? o.permalink);
  const title = asString(o.title ?? o.headline ?? o.text);
  const excerpt = asString(o.excerpt ?? o.body ?? o.snippet ?? o.content);

  if (!title && !excerpt && !url) {
    return { ok: false, raw: body, error: "no title, excerpt, or url" };
  }

  return {
    ok: true,
    signal: {
      id: crypto.randomUUID(),
      capturedAt: Date.now(),
      platform: asPlatform(o.platform ?? o.network ?? o.source),
      sourceType: asString(o.type ?? o.source_type ?? o.sourceType),
      title,
      author: asString(o.author ?? o.user ?? o.username ?? o.handle),
      url,
      postedAt: asString(o.posted_at ?? o.postedAt ?? o.date ?? o.created_at),
      score: asNumber(o.score ?? o.upvotes ?? o.likes ?? o.reactions),
      comments: asNumber(o.comments ?? o.comment_count ?? o.replies),
      community: asString(o.community ?? o.subreddit ?? o.page ?? o.account),
      query: asString(o.query ?? o.search ?? o.matched_query),
      excerpt,
      sentiment: asString(o.sentiment),
      theme: asString(o.theme ?? o.hook ?? o.angle),
      tool: ctx.tool,
      seq: ctx.seq,
      verified: isHttpUrl(url),
    },
  };
}
