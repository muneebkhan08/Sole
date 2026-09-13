import Link from "next/link";
import { ArrowLeft, FileSpreadsheet, FileText, Inbox } from "lucide-react";
import { listRuns } from "@/lib/runs";

export const dynamic = "force-dynamic";

function ago(at: number) {
  const s = Math.round((Date.now() - at) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return new Date(at).toLocaleDateString();
}

export default async function RunsPage() {
  const runs = await listRuns();

  return (
    <div className="docpage">
      <div className="doc">
        <Link href="/" className="doc-back">
          <ArrowLeft size={13} /> Back to the floor
        </Link>

        <header className="doc-head">
          <div className="doc-eyebrow">
            <FileText size={12} /> History
          </div>
          <h1 className="doc-title">Task runs</h1>
          <p className="doc-sub">
            Every brief the floor has worked, with the data each one captured.
          </p>
        </header>

        {runs.length === 0 ? (
          <div className="empty" style={{ marginTop: 24 }}>
            <Inbox size={20} />
            <p>
              No runs yet. Brief the team on the floor and the spreadsheet and
              report will land here.
            </p>
          </div>
        ) : (
          <div className="runlist">
            {runs.map((run) => (
              <Link key={run.id} href={`/runs/${run.id}`} className="runcard">
                <div className="runcard-brief">{run.brief}</div>
                <div className="runcard-meta">
                  <span className="chip">{ago(run.createdAt)}</span>
                  <span className="chip">{run.roster.agents.join(" → ")}</span>
                  <span className="chip">
                    <strong>{run.counts.signals}</strong> signals
                  </span>
                  {run.artifacts.some((a) => a.kind === "xlsx") && (
                    <span className="chip chip-on">
                      <FileSpreadsheet size={11} /> xlsx
                    </span>
                  )}
                  {run.artifacts.some((a) => a.kind === "pdf") && (
                    <span className="chip chip-on">
                      <FileText size={11} /> pdf
                    </span>
                  )}
                  {run.status !== "completed" && (
                    <span className="chip">{run.status}</span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
