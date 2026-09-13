"use client";

import Link from "next/link";
import { ArrowUpRight, FileSpreadsheet, FileText, Sparkles } from "lucide-react";
import { useHq } from "@/components/providers/HqProvider";

function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function ArtifactTray() {
  const { artifacts, taskId, signalCount, busy } = useHq();

  if (!taskId) return null;
  if (!artifacts.length && !(busy && signalCount)) return null;

  return (
    <div className="artifact-tray">
      <div className="tray-title">
        <Sparkles size={12} />
        {artifacts.length ? "Files from this task" : "Collecting"}
      </div>

      {!artifacts.length ? (
        <div className="tray-sub">
          {signalCount} signal{signalCount === 1 ? "" : "s"} captured so far…
        </div>
      ) : (
        <>
          {artifacts.map((a) => (
            <div className="tray-row" key={a.name}>
              {a.kind === "xlsx" ? (
                <FileSpreadsheet size={15} color="var(--analyzer)" />
              ) : (
                <FileText size={15} color="var(--accent)" />
              )}
              <div className="tray-row-copy">
                <div className="tray-name">{a.name}</div>
                <div className="tray-sub">
                  {a.rows != null ? `${a.rows} rows · ` : ""}
                  {fmtBytes(a.bytes)}
                </div>
              </div>
              <a
                className="btn"
                href={a.kind === "pdf" ? `${a.href}?download=1` : a.href}
                download
                style={{ padding: "5px 8px", fontSize: 11 }}
              >
                Save
              </a>
            </div>
          ))}
          <Link className="btn btn-primary" href={`/runs/${taskId}`}>
            <ArrowUpRight size={14} /> Open detailed view
          </Link>
        </>
      )}
    </div>
  );
}
