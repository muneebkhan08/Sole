import { listRuns } from "@/lib/runs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const runs = await listRuns();
  return Response.json({
    runs: runs.map((r) => ({
      id: r.id,
      brief: r.brief,
      createdAt: r.createdAt,
      endedAt: r.endedAt,
      status: r.status,
      agents: r.roster.agents,
      platforms: r.roster.platforms,
      reason: r.roster.reason,
      counts: r.counts,
      artifacts: r.artifacts,
    })),
  });
}
