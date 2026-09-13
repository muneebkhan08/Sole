import { Readable } from "stream";
import { artifactStream, isRunId } from "@/lib/runs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TYPES: Record<string, string> = {
  "signals.xlsx":
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "report.pdf": "application/pdf",
  "transcript.md": "text/markdown; charset=utf-8",
  "run.json": "application/json",
};

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; file: string }> },
) {
  const { id, file } = await params;
  if (!isRunId(id) || !TYPES[file]) {
    return Response.json({ error: "not found" }, { status: 404 });
  }

  try {
    const { stream, bytes } = await artifactStream(id, file);
    // The PDF renders in an iframe inside Sole, so it must be served inline.
    // ?download=1 forces the save dialog instead.
    const download = new URL(req.url).searchParams.get("download") === "1";
    const inline = !download && file.endsWith(".pdf");
    return new Response(Readable.toWeb(stream) as ReadableStream, {
      headers: {
        "Content-Type": TYPES[file],
        "Content-Length": String(bytes),
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${file}"`,
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch {
    return Response.json({ error: "artifact not found" }, { status: 404 });
  }
}
