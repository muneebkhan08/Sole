import { hermesHealth } from "@/lib/hermes";

export const dynamic = "force-dynamic";

export async function GET() {
  const health = await hermesHealth();
  return Response.json(health, { status: health.ok ? 200 : 503 });
}
