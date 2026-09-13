import {
  isRunId,
  readRun,
  readSignals,
  readTools,
  readTranscript,
  readUnverified,
} from "@/lib/runs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!isRunId(id)) {
    return Response.json({ error: "invalid run id" }, { status: 400 });
  }
  const run = await readRun(id);
  if (!run) return Response.json({ error: "run not found" }, { status: 404 });

  const [signals, tools, malformed, transcript] = await Promise.all([
    readSignals(id),
    readTools(id),
    readUnverified(id),
    readTranscript(id),
  ]);

  return Response.json({
    run,
    signals,
    tools,
    malformed,
    transcript,
  });
}
