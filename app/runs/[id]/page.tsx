import { RunDetail } from "@/components/runs/RunDetail";

export const dynamic = "force-dynamic";

export default async function RunPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="docpage">
      <RunDetail id={id} />
    </div>
  );
}
