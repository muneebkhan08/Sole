import ExcelJS from "exceljs";
import type { Column, Worksheet } from "exceljs";
import type { RunManifest, Signal, ToolCall } from "../types";
import { artifactPath, readSignals, readTools, readUnverified } from "../runs";

const INK = "FF242421";
const ACCENT = "FFC26043";
const HEAD_BG = "FF2B2A27";
const ZEBRA = "FFF7F5F0";

function header(sheet: Worksheet, columns: Partial<Column>[]) {
  sheet.columns = columns;
  const row = sheet.getRow(1);
  row.height = 22;
  row.font = { bold: true, size: 10, color: { argb: "FFFFFDF8" } };
  row.alignment = { vertical: "middle" };
  row.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEAD_BG } };
  });
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: columns.length },
  };
}

function zebra(sheet: Worksheet) {
  sheet.eachRow((row, i) => {
    if (i === 1 || i % 2 === 1) return;
    row.eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ZEBRA } };
    });
  });
}

function signalsSheet(book: ExcelJS.Workbook, name: string, rows: Signal[]) {
  const sheet = book.addWorksheet(name);
  header(sheet, [
    { header: "#", key: "n", width: 5 },
    { header: "Captured", key: "capturedAt", width: 18 },
    { header: "Platform", key: "platform", width: 12 },
    { header: "Type", key: "sourceType", width: 11 },
    { header: "Community", key: "community", width: 18 },
    { header: "Title", key: "title", width: 52 },
    { header: "Author", key: "author", width: 18 },
    { header: "Posted", key: "postedAt", width: 18 },
    { header: "Score", key: "score", width: 9 },
    { header: "Comments", key: "comments", width: 11 },
    { header: "Sentiment", key: "sentiment", width: 12 },
    { header: "Theme / hook", key: "theme", width: 28 },
    { header: "Matched query", key: "query", width: 24 },
    { header: "Excerpt", key: "excerpt", width: 64 },
    { header: "URL", key: "url", width: 48 },
    { header: "Tool", key: "tool", width: 18 },
    { header: "Seq", key: "seq", width: 7 },
  ]);

  rows.forEach((s, i) => {
    const row = sheet.addRow({
      n: i + 1,
      capturedAt: new Date(s.capturedAt),
      platform: s.platform ?? "",
      sourceType: s.sourceType ?? "",
      community: s.community ?? "",
      title: s.title ?? "",
      author: s.author ?? "",
      postedAt: s.postedAt ?? "",
      score: s.score ?? null,
      comments: s.comments ?? null,
      sentiment: s.sentiment ?? "",
      theme: s.theme ?? "",
      query: s.query ?? "",
      excerpt: s.excerpt ?? "",
      url: s.url ?? "",
      tool: s.tool ?? "",
      seq: s.seq ?? null,
    });
    row.getCell("capturedAt").numFmt = "yyyy-mm-dd hh:mm";
    row.alignment = { vertical: "top", wrapText: true };
    const url = row.getCell("url");
    if (s.url) {
      url.value = { text: s.url, hyperlink: s.url };
      url.font = { color: { argb: ACCENT }, underline: true };
    }
  });

  zebra(sheet);
  return sheet;
}

/**
 * Build the Scrapper workbook for a run.
 *
 * Unverified rows (no resolvable URL) get their own sheet rather than being
 * mixed in: a spreadsheet reads as authoritative, and a row nothing can be
 * traced back to must not inherit that authority.
 */
export async function buildSignalsWorkbook(
  run: RunManifest,
): Promise<{ path: string; bytes: number; rows: number }> {
  const [signals, tools, malformed] = await Promise.all([
    readSignals(run.id),
    readTools(run.id),
    readUnverified(run.id),
  ]);

  const verified = signals.filter((s) => s.verified);
  const unverified = signals.filter((s) => !s.verified);

  const book = new ExcelJS.Workbook();
  book.creator = "Sole HQ";
  book.created = new Date(run.createdAt);

  signalsSheet(book, "Signals", verified);

  // Themes rollup
  const themes = new Map<string, { count: number; score: number; platforms: Set<string> }>();
  for (const s of signals) {
    const key = s.theme || s.sentiment || "(untagged)";
    const t = themes.get(key) ?? { count: 0, score: 0, platforms: new Set<string>() };
    t.count += 1;
    t.score += s.score ?? 0;
    if (s.platform) t.platforms.add(s.platform);
    themes.set(key, t);
  }
  const themeSheet = book.addWorksheet("Themes");
  header(themeSheet, [
    { header: "Theme / hook", key: "theme", width: 40 },
    { header: "Signals", key: "count", width: 10 },
    { header: "Total score", key: "score", width: 13 },
    { header: "Avg score", key: "avg", width: 11 },
    { header: "Platforms", key: "platforms", width: 28 },
  ]);
  for (const [theme, t] of [...themes].sort((a, b) => b[1].count - a[1].count)) {
    themeSheet.addRow({
      theme,
      count: t.count,
      score: t.score,
      avg: t.count ? Math.round((t.score / t.count) * 10) / 10 : 0,
      platforms: [...t.platforms].join(", "),
    });
  }
  zebra(themeSheet);

  // Tool ledger
  const toolSheet = book.addWorksheet("Tools");
  header(toolSheet, [
    { header: "Seq", key: "seq", width: 7 },
    { header: "Time", key: "at", width: 18 },
    { header: "Agent", key: "agent", width: 13 },
    { header: "Tool", key: "name", width: 26 },
    { header: "Phase", key: "phase", width: 12 },
    { header: "Platform", key: "platform", width: 12 },
    { header: "Arguments", key: "args", width: 58 },
    { header: "Preview", key: "preview", width: 58 },
  ]);
  tools.forEach((t: ToolCall) => {
    const row = toolSheet.addRow({
      seq: t.seq,
      at: new Date(t.at),
      agent: t.agent,
      name: t.name,
      phase: t.phase,
      platform: t.platform ?? "",
      args: t.args ?? "",
      preview: t.preview ?? "",
    });
    row.getCell("at").numFmt = "yyyy-mm-dd hh:mm:ss";
    row.alignment = { vertical: "top", wrapText: true };
  });
  zebra(toolSheet);

  // Unverified / quarantine
  if (unverified.length || malformed.length) {
    // No banner row here: inserting above row 1 would push the header out from
    // under the frozen pane and the autofilter. The sheet name carries it.
    signalsSheet(book, "Unverified", unverified);
    if (malformed.length) {
      const bad = book.addWorksheet("Malformed");
      header(bad, [
        { header: "Time", key: "at", width: 18 },
        { header: "Error", key: "error", width: 22 },
        { header: "Raw line", key: "raw", width: 96 },
      ]);
      malformed.forEach((m) => {
        const row = bad.addRow({ at: new Date(m.at), error: m.error, raw: m.raw });
        row.getCell("at").numFmt = "yyyy-mm-dd hh:mm:ss";
        row.alignment = { vertical: "top", wrapText: true };
      });
      zebra(bad);
    }
  }

  // Run metadata
  const meta = book.addWorksheet("Run");
  header(meta, [
    { header: "Field", key: "k", width: 24 },
    { header: "Value", key: "v", width: 96 },
  ]);
  const rows: [string, string][] = [
    ["Run id", run.id],
    ["Brief", run.brief],
    ["Status", run.status],
    ["Agents", run.roster.agents.join(" → ")],
    ["Routing", run.roster.reason],
    ["Platforms", run.roster.platforms.join(", ") || "(none named)"],
    ["Started", new Date(run.createdAt).toISOString()],
    ["Ended", run.endedAt ? new Date(run.endedAt).toISOString() : "—"],
    ["Signals (verified)", String(verified.length)],
    ["Signals (unverified)", String(unverified.length)],
    ["Malformed lines", String(malformed.length)],
    ["Tool calls", String(tools.length)],
    ["Input tokens", run.usage?.inputTokens != null ? String(run.usage.inputTokens) : "—"],
    ["Output tokens", run.usage?.outputTokens != null ? String(run.usage.outputTokens) : "—"],
  ];
  rows.forEach(([k, v]) => {
    const row = meta.addRow({ k, v });
    row.getCell("k").font = { bold: true, color: { argb: INK } };
    row.alignment = { vertical: "top", wrapText: true };
  });
  zebra(meta);

  const path = artifactPath(run.id, "signals.xlsx");
  await book.xlsx.writeFile(path);
  const { size } = await import("fs/promises").then((m) => m.stat(path));
  return { path, bytes: size, rows: verified.length };
}
