import { createAcc, hermesFrameToSole, encodeSoleEvent } from "@/lib/bridge";
import { hermesConfigured, streamSoleChat } from "@/lib/hermes";
import { wrapTask } from "@/lib/prompts";
import { routeTask } from "@/lib/router";
import { readSse } from "@/lib/sse";
import {
  appendEvent,
  appendSignal,
  appendTool,
  appendUnverified,
  openRun,
  readRun,
  recordArtifact,
  releaseRun,
  writeManifest,
  writeTranscript,
} from "@/lib/runs";
import { buildSignalsWorkbook } from "@/lib/artifacts/xlsx";
import { buildRunReport } from "@/lib/artifacts/pdf";
import type { ArtifactRef, RunManifest, SoleEvent } from "@/lib/types";

// Scrape-heavy briefs routinely run past five minutes.
export const maxDuration = 900;
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Every brief shares the Hermes session `sole-hq`, so two overlapping runs
 * interrupt each other — the second one lands while the first is still
 * draining and Hermes answers "Operation interrupted." The browser guards this
 * per tab; this guards it for the process.
 */
let active: { id: string; startedAt: number } | null = null;

function busyStream(): Response {
  const encoder = new TextEncoder();
  const waited = active ? Math.round((Date.now() - active.startedAt) / 1000) : 0;
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(
        encoder.encode(
          encodeSoleEvent({
            type: "error",
            message: `A task has been running for ${waited}s. Sole shares one Hermes session, so briefs run one at a time — wait for this one to finish.`,
          }),
        ),
      );
      controller.close();
    },
  });
  return new Response(stream, {
    status: 409,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { message?: string } | null;
  const message = body?.message?.trim() ?? "";
  if (!message) {
    return Response.json({ error: "message is required" }, { status: 400 });
  }

  if (active) return busyStream();

  const encoder = new TextEncoder();
  const taskId = crypto.randomUUID();
  const roster = routeTask(message);
  active = { id: taskId, startedAt: Date.now() };

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const send = (event: SoleEvent) => {
        if (closed) return;
        controller.enqueue(encoder.encode(encodeSoleEvent(event)));
        void appendEvent(taskId, event).catch(() => {});
      };

      const manifest: RunManifest = {
        id: taskId,
        brief: message,
        createdAt: Date.now(),
        status: "running",
        roster,
        counts: { signals: 0, unverified: 0, tools: 0, notifications: 0 },
        artifacts: [],
      };

      try {
        await openRun(manifest);
      } catch {
        // A run that cannot be persisted should still stream to the floor.
      }

      send({ type: "task.started", taskId, message });
      send({
        type: "task.routed",
        taskId,
        agents: roster.agents,
        platforms: roster.platforms,
        scope: roster.scope,
        reason: roster.reason,
      });

      const cfg = hermesConfigured();
      if (!cfg.ok) {
        send({
          type: "error",
          message:
            "Hermes API key missing. Set HERMES_API_KEY or keep the social-army gateway profile on this machine.",
        });
        manifest.status = "failed";
        manifest.error = cfg.error;
        manifest.endedAt = Date.now();
        await writeManifest(manifest).catch(() => {});
        releaseRun(taskId);
        if (active?.id === taskId) active = null;
        closed = true;
        controller.close();
        return;
      }

      const acc = createAcc(taskId, roster);
      // Cursors so each collected row is persisted exactly once as it arrives.
      let signalsWritten = 0;
      let malformedWritten = 0;
      let toolsWritten = 0;
      let notifications = 0;

      const flush = async () => {
        for (; signalsWritten < acc.signals.length; signalsWritten += 1) {
          await appendSignal(taskId, acc.signals[signalsWritten]).catch(() => {});
        }
        for (; malformedWritten < acc.malformed.length; malformedWritten += 1) {
          const m = acc.malformed[malformedWritten];
          await appendUnverified(taskId, m.raw, m.error).catch(() => {});
        }
        for (; toolsWritten < acc.tools.length; toolsWritten += 1) {
          await appendTool(taskId, acc.tools[toolsWritten]).catch(() => {});
        }
      };

      try {
        const hermes = await streamSoleChat(wrapTask(message, roster), req.signal);
        if (!hermes.body) {
          send({ type: "error", message: "Hermes returned an empty stream" });
          manifest.status = "failed";
          manifest.error = "empty stream";
        } else {
          for await (const frame of readSse(hermes.body)) {
            for (const event of hermesFrameToSole(frame, acc)) {
              if (event.type === "notify") notifications += 1;
              send(event);
            }
            await flush();
          }
          manifest.status = "completed";
        }
      } catch (error) {
        const aborted =
          req.signal.aborted ||
          (error instanceof Error && error.name === "AbortError");
        const text = aborted
          ? "Task stopped — the client disconnected before Hermes finished."
          : error instanceof Error
            ? error.message
            : "Hermes bridge failed";
        send({ type: "error", message: text });
        manifest.status = "failed";
        manifest.error = text;
      }

      // ---- Finalise: persist, then build the artifacts for this run ----
      try {
        await flush();
        if (acc.transcript) await writeTranscript(taskId, acc.transcript).catch(() => {});

        manifest.endedAt = Date.now();
        manifest.usage = acc.usage;
        manifest.model = acc.model;
        manifest.roster = acc.roster;
        manifest.summary = acc.transcript.slice(0, 4000);
        manifest.counts = {
          signals: acc.signals.filter((s) => s.verified).length,
          unverified:
            acc.signals.filter((s) => !s.verified).length + acc.malformed.length,
          tools: acc.tools.filter((t) => t.phase === "started").length,
          notifications,
        };
        await writeManifest(manifest).catch(() => {});

        const built: ArtifactRef[] = [];

        // The workbook is the Scrapper's deliverable — only build it when the
        // brief actually collected something.
        if (acc.signals.length > 0 || acc.malformed.length > 0) {
          try {
            const saved = await readRun(taskId);
            const wb = await buildSignalsWorkbook(saved ?? manifest);
            built.push({
              kind: "xlsx",
              name: "signals.xlsx",
              href: `/api/runs/${taskId}/signals.xlsx`,
              bytes: wb.bytes,
              rows: wb.rows,
            });
          } catch (error) {
            console.error("[sole] workbook build failed", error);
          }
        }

        try {
          const saved = await readRun(taskId);
          const pdf = await buildRunReport(saved ?? manifest);
          built.push({
            kind: "pdf",
            name: "report.pdf",
            href: `/api/runs/${taskId}/report.pdf`,
            bytes: pdf.bytes,
          });
        } catch (error) {
          console.error("[sole] report build failed", error);
        }

        for (const ref of built) {
          await recordArtifact(taskId, ref).catch(() => {});
          send({ type: "artifact", taskId, artifact: ref });
        }
      } catch (error) {
        console.error("[sole] finalise failed", error);
      }

      send({ type: "task.done", taskId, text: acc.transcript });
      releaseRun(taskId);
      if (active?.id === taskId) active = null;
      closed = true;
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
