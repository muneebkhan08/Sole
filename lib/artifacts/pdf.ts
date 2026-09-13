import PDFDocument from "pdfkit";
import { createWriteStream } from "fs";
import { stat } from "fs/promises";
import type { RunManifest, Signal, ToolCall } from "../types";
import {
  artifactPath,
  readSignals,
  readTools,
  readTranscript,
  readUnverified,
} from "../runs";

const INK = "#242421";
const MUTED = "#6d6b65";
const QUIET = "#98958e";
const ACCENT = "#c26043";
const LINE = "#dfdcd3";

const AGENT_COLOR: Record<string, string> = {
  scrapper: "#b86a4f",
  analyzer: "#3d877d",
  planner: "#766ba8",
  poster: "#b45f79",
};

type Doc = InstanceType<typeof PDFDocument>;

const MARGIN = 48;

function rule(doc: Doc) {
  doc
    .moveTo(MARGIN, doc.y)
    .lineTo(doc.page.width - MARGIN, doc.y)
    .strokeColor(LINE)
    .lineWidth(0.75)
    .stroke();
  doc.moveDown(0.7);
}

function heading(doc: Doc, text: string) {
  if (doc.y > doc.page.height - 140) doc.addPage();
  doc.moveDown(0.8);
  doc.font("Helvetica-Bold").fontSize(13).fillColor(INK).text(text);
  doc.moveDown(0.4);
  rule(doc);
}

function kv(doc: Doc, key: string, value: string) {
  doc.font("Helvetica-Bold").fontSize(9).fillColor(MUTED).text(key, { continued: true });
  doc.font("Helvetica").fillColor(INK).text(`   ${value}`);
  doc.moveDown(0.2);
}

function body(doc: Doc, text: string, color = INK) {
  doc.font("Helvetica").fontSize(10).fillColor(color).text(text, { align: "left" });
  doc.moveDown(0.3);
}

function clip(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/**
 * Build the run report: what was asked, who worked, what they touched, what
 * came back. Draft copy is stamped with its queue state so the document can
 * never be mistaken for evidence that something was published.
 */
export async function buildRunReport(
  run: RunManifest,
): Promise<{ path: string; bytes: number }> {
  const [signals, tools, malformed, transcript] = await Promise.all([
    readSignals(run.id),
    readTools(run.id),
    readUnverified(run.id),
    readTranscript(run.id),
  ]);

  const path = artifactPath(run.id, "report.pdf");
  const doc = new PDFDocument({ size: "A4", margin: MARGIN, bufferPages: true });
  const out = createWriteStream(path);
  const done = new Promise<void>((resolve, reject) => {
    out.on("finish", () => resolve());
    out.on("error", reject);
  });
  doc.pipe(out);

  // ---- Cover ----
  doc.font("Helvetica-Bold").fontSize(26).fillColor(INK).text("Sole HQ");
  doc.font("Helvetica").fontSize(11).fillColor(ACCENT).text("Task report");
  doc.moveDown(1);
  doc.font("Helvetica-Bold").fontSize(15).fillColor(INK).text(clip(run.brief, 240));
  doc.moveDown(0.8);
  rule(doc);

  const durationMs = (run.endedAt ?? Date.now()) - run.createdAt;
  kv(doc, "Run", run.id);
  kv(doc, "Status", run.status);
  kv(doc, "Started", new Date(run.createdAt).toLocaleString());
  kv(doc, "Duration", `${(durationMs / 1000).toFixed(1)}s`);
  kv(doc, "Agents", run.roster.agents.join("  →  "));
  kv(doc, "Routing", run.roster.reason);
  kv(doc, "Platforms", run.roster.platforms.join(", ") || "none named");
  if (run.usage?.totalTokens != null) {
    kv(doc, "Tokens", String(run.usage.totalTokens));
  }

  // ---- Roster ----
  heading(doc, "Who worked this brief");
  const benched = (["scrapper", "analyzer", "planner", "poster"] as const).filter(
    (a) => !run.roster.agents.includes(a),
  );
  for (const agent of run.roster.agents) {
    const calls = tools.filter((t) => t.agent === agent && t.phase === "started").length;
    const y = doc.y;
    doc.circle(MARGIN + 4, y + 5, 3.5).fillColor(AGENT_COLOR[agent] ?? ACCENT).fill();
    doc
      .font("Helvetica-Bold")
      .fontSize(10)
      .fillColor(INK)
      .text(agent, MARGIN + 14, y, { width: 90 });
    doc
      .font("Helvetica")
      .fontSize(10)
      .fillColor(MUTED)
      .text(`${calls} tool ${calls === 1 ? "call" : "calls"}`, MARGIN + 110, y, {
        width: 200,
      });
    doc.x = MARGIN;
    doc.y = y + 15;
  }
  if (benched.length) {
    doc.moveDown(0.3);
    body(doc, `Not assigned: ${benched.join(", ")}`, QUIET);
  }

  // ---- Timeline ----
  heading(doc, "Timeline");
  if (tools.length === 0) {
    body(doc, "No tool calls were made during this run.", QUIET);
  } else {
    for (const t of tools as ToolCall[]) {
      if (doc.y > doc.page.height - 90) doc.addPage();
      // Explicit columns: a `continued` chain would inherit the first cell's
      // width and wrap every tool name mid-word.
      const y = doc.y;
      const offset = ((t.at - run.createdAt) / 1000).toFixed(1);
      doc.font("Helvetica").fontSize(8).fillColor(QUIET).text(`+${offset}s`, MARGIN, y + 1, {
        width: 42,
      });
      doc
        .font("Helvetica-Bold")
        .fontSize(9)
        .fillColor(AGENT_COLOR[t.agent] ?? INK)
        .text(t.agent, MARGIN + 46, y, { width: 62, lineBreak: false });
      doc
        .font("Helvetica")
        .fontSize(9)
        .fillColor(INK)
        .text(t.name, MARGIN + 112, y, { width: 190, lineBreak: false });
      doc
        .font("Helvetica")
        .fontSize(8)
        .fillColor(t.phase === "failed" ? "#b4433a" : QUIET)
        .text(t.phase, MARGIN + 310, y + 1, { width: 64, lineBreak: false });
      let next = y + 13;
      if (t.args) {
        doc
          .font("Helvetica")
          .fontSize(8)
          .fillColor(MUTED)
          .text(clip(t.args, 150), MARGIN + 46, next, {
            width: doc.page.width - MARGIN * 2 - 46,
          });
        next = doc.y + 2;
      }
      doc.x = MARGIN;
      doc.y = next;
    }
  }

  // ---- Signals ----
  heading(doc, "Signals captured");
  const verified = signals.filter((s) => s.verified);
  body(
    doc,
    `${verified.length} verified, ${signals.length - verified.length} unverified, ` +
      `${malformed.length} malformed. Full data in signals.xlsx.`,
    MUTED,
  );
  doc.moveDown(0.3);
  for (const s of verified.slice(0, 25) as Signal[]) {
    if (doc.y > doc.page.height - 110) doc.addPage();
    doc
      .font("Helvetica-Bold")
      .fontSize(9.5)
      .fillColor(INK)
      .text(clip(s.title || s.excerpt || s.url || "(untitled)", 110));
    const meta = [
      s.platform,
      s.community,
      s.author,
      s.score != null ? `${s.score} pts` : null,
      s.comments != null ? `${s.comments} comments` : null,
    ]
      .filter(Boolean)
      .join("  ·  ");
    if (meta) doc.font("Helvetica").fontSize(8).fillColor(MUTED).text(meta);
    if (s.url) doc.font("Helvetica").fontSize(7.5).fillColor(ACCENT).text(clip(s.url, 120));
    doc.moveDown(0.35);
  }
  if (verified.length > 25) {
    body(doc, `… and ${verified.length - 25} more in the workbook.`, QUIET);
  }

  // ---- Outcome ----
  heading(doc, "What the team returned");
  const text = transcript || run.summary || "";
  if (!text.trim()) {
    body(doc, "No assistant output was recorded for this run.", QUIET);
  } else {
    // Strip the machine tags — they are floor choreography, not report content.
    const clean = text
      .replace(/\[\[(agent|platform):[a-z]+\]\]/gi, "")
      .replace(/\[\[notify\]\]/gi, "")
      .replace(/^\s*\[\[signal\]\].*$/gim, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    doc.font("Helvetica").fontSize(9.5).fillColor(INK).text(clean, { align: "left" });
  }

  if (run.roster.agents.includes("poster")) {
    doc.moveDown(0.8);
    doc
      .rect(MARGIN, doc.y, doc.page.width - MARGIN * 2, 26)
      .fillColor("#f7e7de")
      .fill();
    doc
      .font("Helvetica-Bold")
      .fontSize(9)
      .fillColor(ACCENT)
      .text("DRAFTS QUEUED — NOT PUBLISHED", MARGIN + 10, doc.y - 18);
    doc.moveDown(1);
  }

  if (run.error) {
    heading(doc, "Error");
    body(doc, run.error, "#b4433a");
  }

  // ---- Footer on every page ----
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i += 1) {
    doc.switchToPage(range.start + i);
    // The footer sits below the bottom margin; without clearing it pdfkit
    // treats the write as an overflow and appends a blank page.
    doc.page.margins.bottom = 0;
    doc
      .font("Helvetica")
      .fontSize(7.5)
      .fillColor(QUIET)
      .text(
        `Sole HQ  ·  run ${run.id.slice(0, 8)}  ·  page ${i + 1} of ${range.count}`,
        MARGIN,
        doc.page.height - 32,
        { width: doc.page.width - MARGIN * 2, align: "center" },
      );
  }

  doc.end();
  await done;
  const info = await stat(path);
  return { path, bytes: info.size };
}
