"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Download,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  Inbox,
} from "lucide-react";
import { AGENTS, PLATFORMS } from "@/lib/agents";
import type {
  AgentId,
  PlatformId,
  RunManifest,
  Signal,
  ToolCall,
} from "@/lib/types";

type Payload = {
  run: RunManifest;
  signals: Signal[];
  tools: ToolCall[];
  malformed: { at: number; raw: string; error: string }[];
  transcript: string;
};

type Tab = "signals" | "timeline" | "report" | "transcript";

function fmtTime(ms: number) {
  return new Date(ms).toLocaleString();
}

/** Full URL stays in the href; the cell shows a compact label so a long
 *  permalink cannot wrap into four lines and inflate every row. */
function shortUrl(raw: string) {
  try {
    const u = new URL(raw);
    const path = u.pathname.replace(/\/$/, "");
    const label = `${u.hostname.replace(/^www\./, "")}${path}`;
    return label.length > 38 ? `${label.slice(0, 37)}…` : label;
  } catch {
    return raw.length > 38 ? `${raw.slice(0, 37)}…` : raw;
  }
}

function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function RunDetail({ id }: { id: string }) {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("signals");
  const [q, setQ] = useState("");
  const [platform, setPlatform] = useState<PlatformId | "all">("all");

  useEffect(() => {
    let alive = true;
    fetch(`/api/runs/${id}`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json()).error ?? "not found");
        return res.json();
      })
      .then((json: Payload) => alive && setData(json))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [id]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const needle = q.trim().toLowerCase();
    return data.signals.filter((s) => {
      if (platform !== "all" && s.platform !== platform) return false;
      if (!needle) return true;
      return [s.title, s.excerpt, s.author, s.community, s.theme, s.url, s.query]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(needle));
    });
  }, [data, q, platform]);

  if (error) {
    return (
      <div className="doc">
        <Link href="/runs" className="doc-back">
          <ArrowLeft size={13} /> All runs
        </Link>
        <div className="empty" style={{ marginTop: 24 }}>
          <Inbox size={20} />
          <p>Could not load this run: {error}</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="doc">
        <div className="empty" style={{ marginTop: 24 }}>
          <p>Loading run…</p>
        </div>
      </div>
    );
  }

  const { run, signals, tools, malformed, transcript } = data;
  const xlsx = run.artifacts.find((a) => a.kind === "xlsx");
  const pdf = run.artifacts.find((a) => a.kind === "pdf");
  const started = tools.filter((t) => t.phase === "started");
  const duration = run.endedAt ? (run.endedAt - run.createdAt) / 1000 : null;

  return (
    <div className="doc">
      <Link href="/runs" className="doc-back">
        <ArrowLeft size={13} /> All runs
      </Link>

      <header className="doc-head">
        <div className="doc-eyebrow">
          <FileText size={12} /> Task report
        </div>
        <h1 className="doc-title">{run.brief}</h1>
        <p className="doc-sub">{run.roster.reason}</p>

        <div className="doc-meta">
          {(Object.keys(AGENTS) as AgentId[]).map((a) => {
            const on = run.roster.agents.includes(a);
            return (
              <span key={a} className={`chip ${on ? "chip-on" : "chip-off"}`}>
                <span
                  className="dot"
                  style={{ background: AGENTS[a].color, color: AGENTS[a].color }}
                />
                {AGENTS[a].name}
                {!on && " · benched"}
              </span>
            );
          })}
          {run.roster.platforms.map((p) => (
            <span key={p} className="chip">
              {PLATFORMS[p].name}
            </span>
          ))}
        </div>

        <div className="doc-meta">
          <span className="chip">
            <strong>{run.counts.signals}</strong> signals
          </span>
          <span className="chip">
            <strong>{run.counts.unverified}</strong> unverified
          </span>
          <span className="chip">
            <strong>{started.length}</strong> tool calls
          </span>
          <span className="chip">
            status <strong>{run.status}</strong>
          </span>
          {duration != null && (
            <span className="chip">
              <strong>{duration.toFixed(1)}s</strong>
            </span>
          )}
          <span className="chip">{fmtTime(run.createdAt)}</span>
        </div>

        <div className="doc-actions">
          {xlsx && (
            <a className="btn btn-primary" href={xlsx.href} download>
              <FileSpreadsheet size={14} /> Download spreadsheet
              <span style={{ opacity: 0.75 }}>({fmtBytes(xlsx.bytes)})</span>
            </a>
          )}
          {pdf && (
            <>
              <a className="btn" href={`${pdf.href}?download=1`} download>
                <Download size={14} /> Download PDF
              </a>
              <a className="btn" href={pdf.href} target="_blank" rel="noreferrer">
                <ExternalLink size={14} /> Open PDF in a tab
              </a>
            </>
          )}
        </div>
      </header>

      <nav className="tabs">
        {(
          [
            ["signals", "Signals", signals.length],
            ["timeline", "Timeline", started.length],
            ["report", "Report", null],
            ["transcript", "Transcript", null],
          ] as [Tab, string, number | null][]
        ).map(([key, label, count]) => (
          <button
            key={key}
            type="button"
            className={`tab ${tab === key ? "tab-on" : ""}`}
            onClick={() => setTab(key)}
          >
            {label}
            {count != null && <span className="tab-count">{count}</span>}
          </button>
        ))}
      </nav>

      <div className="panel">
        {tab === "signals" &&
          (signals.length === 0 ? (
            <div className="empty">
              <Inbox size={20} />
              <p>
                No signals were captured on this run. Only briefs that put
                Scrapper on the roster produce a spreadsheet.
              </p>
            </div>
          ) : (
            <>
              <div className="filters">
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Filter by title, author, community, theme, url…"
                  aria-label="Filter signals"
                />
                <select
                  value={platform}
                  onChange={(e) => setPlatform(e.target.value as PlatformId | "all")}
                  aria-label="Filter by platform"
                >
                  <option value="all">All platforms</option>
                  {run.roster.platforms.concat().map((p) => (
                    <option key={p} value={p}>
                      {PLATFORMS[p].name}
                    </option>
                  ))}
                </select>
                <span className="chip">
                  <strong>{filtered.length}</strong> of {signals.length}
                </span>
              </div>

              <div className="tablewrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Platform</th>
                      <th>Community</th>
                      <th>Title</th>
                      <th>Author</th>
                      <th className="cell-num">Score</th>
                      <th className="cell-num">Comments</th>
                      <th>Sentiment</th>
                      <th>Theme</th>
                      <th>Excerpt</th>
                      <th>Posted</th>
                      <th>URL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((s, i) => (
                      <tr key={s.id}>
                        <td className="cell-num">{i + 1}</td>
                        <td>
                          {s.platform ? (
                            <span
                              className="pill"
                              style={{
                                background: `${PLATFORMS[s.platform].color}1f`,
                                color: PLATFORMS[s.platform].color,
                              }}
                            >
                              {PLATFORMS[s.platform].name}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td>{s.community ?? "—"}</td>
                        <td className="cell-title">{s.title ?? "—"}</td>
                        <td>{s.author ?? "—"}</td>
                        <td className="cell-num">{s.score ?? "—"}</td>
                        <td className="cell-num">{s.comments ?? "—"}</td>
                        <td>{s.sentiment ?? "—"}</td>
                        <td>{s.theme ?? "—"}</td>
                        <td className="cell-excerpt">{s.excerpt ?? "—"}</td>
                        <td>{s.postedAt ?? "—"}</td>
                        <td className="cell-url">
                          {s.url ? (
                            <a
                              href={s.url}
                              target="_blank"
                              rel="noreferrer"
                              title={s.url}
                            >
                              {shortUrl(s.url)}
                            </a>
                          ) : (
                            <span style={{ color: "var(--quiet)" }}>unverified</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {malformed.length > 0 && (
                <p className="doc-sub">
                  {malformed.length} line{malformed.length === 1 ? "" : "s"} could not
                  be parsed and {malformed.length === 1 ? "is" : "are"} quarantined in
                  the workbook&rsquo;s Malformed sheet.
                </p>
              )}
            </>
          ))}

        {tab === "timeline" &&
          (started.length === 0 ? (
            <div className="empty">
              <p>No tool calls were recorded for this run.</p>
            </div>
          ) : (
            <div className="timeline">
              {tools.map((t, i) => (
                <div className="tl-row" key={`${t.seq}-${t.phase}-${i}`}>
                  <span className="tl-at">
                    +{((t.at - run.createdAt) / 1000).toFixed(1)}s
                  </span>
                  <span
                    className="tl-agent"
                    style={{ color: AGENTS[t.agent]?.color }}
                  >
                    {t.agent}
                  </span>
                  <span className="tl-name">
                    {t.name}
                    {t.args && (
                      <span className="tl-args" title={t.args}>
                        {t.args}
                      </span>
                    )}
                  </span>
                  <span className={`tl-phase ${t.phase === "failed" ? "tl-failed" : ""}`}>
                    {t.phase}
                  </span>
                </div>
              ))}
            </div>
          ))}

        {tab === "report" &&
          (pdf ? (
            <iframe className="viewer" src={pdf.href} title="Run report" />
          ) : (
            <div className="empty">
              <p>No report was generated for this run.</p>
            </div>
          ))}

        {tab === "transcript" &&
          (transcript.trim() ? (
            <div className="prose">{transcript}</div>
          ) : (
            <div className="empty">
              <p>No transcript was recorded for this run.</p>
            </div>
          ))}
      </div>
    </div>
  );
}
