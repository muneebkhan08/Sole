import { hermesConfigured, hermesHealth, SOLE_SESSION_ID } from "@/lib/hermes";
import { AGENTS, PLATFORMS } from "@/lib/agents";

export const dynamic = "force-dynamic";

export async function GET() {
  const cfg = hermesConfigured();
  const health = await hermesHealth();
  return Response.json({
    hermes: {
      ok: cfg.ok && health.ok,
      version: health.version,
      error: cfg.ok ? health.error : cfg.error,
      session: SOLE_SESSION_ID,
    },
    agents: Object.values(AGENTS).map((a) => ({
      id: a.id,
      name: a.name,
      role: a.role,
    })),
    platforms: Object.values(PLATFORMS).map((p) => ({
      id: p.id,
      name: p.name,
      connected: health.ok,
    })),
  });
}
