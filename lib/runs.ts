import { appendFile, mkdir, readFile, readdir, stat, writeFile } from "fs/promises";
import { createReadStream } from "fs";
import { homedir } from "os";
import { join } from "path";
import type {
  ArtifactRef,
  RunManifest,
  Signal,
  SoleEvent,
  ToolCall,
} from "./types";

const ROOT =
  process.env.SOLE_RUNS_DIR || join(homedir(), ".sole", "runs");

/**
 * Run ids come from crypto.randomUUID() and are used as path segments, so they
 * are validated as UUIDs on every read. Without this a crafted id is an
 * arbitrary-file-read primitive against the user's home directory.
 */
const ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isRunId(id: string): boolean {
  return ID_RE.test(id);
}

export function runDir(id: string): string {
  if (!isRunId(id)) throw new Error("invalid run id");
  return join(ROOT, id);
}

export function artifactPath(id: string, name: string): string {
  if (!/^[a-z0-9._-]+$/i.test(name) || name.includes("..")) {
    throw new Error("invalid artifact name");
  }
  return join(runDir(id), name);
}

/** Secrets must never reach disk, even though Hermes redacts on its side. */
const SECRET_RE =
  /\b(sk-[A-Za-z0-9_-]{16,}|Bearer\s+[A-Za-z0-9._-]{12,}|[A-Za-z0-9_-]*(?:api[_-]?key|token|secret|password|cookie)[A-Za-z0-9_-]*\s*[:=]\s*\S+)/gi;

export function redact(text: string): string {
  return text.replace(SECRET_RE, "[redacted]");
}

/**
 * Appends are serialised per run. `appendEvent` is called fire-and-forget from
 * the stream, and concurrent appendFile calls to the same file are not ordered
 * — which would scramble the event log the report is built from.
 */
const queues = new Map<string, Promise<void>>();

function enqueue(id: string, work: () => Promise<void>): Promise<void> {
  const next = (queues.get(id) ?? Promise.resolve()).then(work, work);
  queues.set(
    id,
    next.catch(() => {}),
  );
  return next;
}

/** Drop a finished run's queue so the map does not grow without bound. */
export function releaseRun(id: string): void {
  queues.delete(id);
}

export async function openRun(manifest: RunManifest): Promise<void> {
  await mkdir(runDir(manifest.id), { recursive: true });
  await writeManifest(manifest);
}

export async function writeManifest(manifest: RunManifest): Promise<void> {
  await writeFile(
    join(runDir(manifest.id), "run.json"),
    JSON.stringify(manifest, null, 2),
    "utf8",
  );
}

/** Appended as the stream runs, so a killed turn still leaves a usable record. */
export function appendEvent(id: string, event: SoleEvent): Promise<void> {
  const line = `${redact(JSON.stringify({ at: Date.now(), ...event }))}\n`;
  return enqueue(id, () =>
    appendFile(join(runDir(id), "events.ndjson"), line, "utf8"),
  );
}

export function appendSignal(id: string, signal: Signal): Promise<void> {
  const line = `${redact(JSON.stringify(signal))}\n`;
  return enqueue(id, () =>
    appendFile(join(runDir(id), "signals.ndjson"), line, "utf8"),
  );
}

export function appendUnverified(
  id: string,
  raw: string,
  error: string,
): Promise<void> {
  const line = `${redact(JSON.stringify({ at: Date.now(), raw, error }))}\n`;
  return enqueue(id, () =>
    appendFile(join(runDir(id), "unverified.ndjson"), line, "utf8"),
  );
}

export function appendTool(id: string, call: ToolCall): Promise<void> {
  const line = `${redact(JSON.stringify(call))}\n`;
  return enqueue(id, () =>
    appendFile(join(runDir(id), "tools.ndjson"), line, "utf8"),
  );
}

export async function writeTranscript(id: string, text: string): Promise<void> {
  await writeFile(join(runDir(id), "transcript.md"), redact(text), "utf8");
}

async function readNdjson<T>(id: string, file: string): Promise<T[]> {
  try {
    const text = await readFile(join(runDir(id), file), "utf8");
    const out: T[] = [];
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      try {
        out.push(JSON.parse(line) as T);
      } catch {
        // A torn final line is expected if the process died mid-append.
      }
    }
    return out;
  } catch {
    return [];
  }
}

export const readSignals = (id: string) => readNdjson<Signal>(id, "signals.ndjson");
export const readTools = (id: string) => readNdjson<ToolCall>(id, "tools.ndjson");
export const readEvents = (id: string) =>
  readNdjson<SoleEvent & { at: number }>(id, "events.ndjson");
export const readUnverified = (id: string) =>
  readNdjson<{ at: number; raw: string; error: string }>(id, "unverified.ndjson");

export async function readRun(id: string): Promise<RunManifest | null> {
  try {
    return JSON.parse(
      await readFile(join(runDir(id), "run.json"), "utf8"),
    ) as RunManifest;
  } catch {
    return null;
  }
}

export async function readTranscript(id: string): Promise<string> {
  try {
    return await readFile(join(runDir(id), "transcript.md"), "utf8");
  } catch {
    return "";
  }
}

export async function listRuns(limit = 50): Promise<RunManifest[]> {
  let entries: string[];
  try {
    // ROOT lives outside the project, so file-tracing it would pull the whole
    // repo into the server bundle.
    entries = await readdir(/* turbopackIgnore: true */ ROOT);
  } catch {
    return [];
  }

  // Order by directory mtime so only the page being returned is parsed,
  // instead of reading and JSON-parsing every manifest on every request.
  const ids = entries.filter(isRunId);
  const stamped = await Promise.all(
    ids.map(async (id) => {
      try {
        const info = await stat(join(ROOT, id));
        return { id, at: info.mtimeMs };
      } catch {
        return { id, at: 0 };
      }
    }),
  );
  stamped.sort((a, b) => b.at - a.at);

  const runs: RunManifest[] = [];
  for (const { id } of stamped.slice(0, limit)) {
    const run = await readRun(id);
    if (run) runs.push(run);
  }
  return runs.sort((a, b) => b.createdAt - a.createdAt);
}

export async function recordArtifact(
  id: string,
  ref: ArtifactRef,
): Promise<void> {
  const run = await readRun(id);
  if (!run) return;
  run.artifacts = [...run.artifacts.filter((a) => a.name !== ref.name), ref];
  await writeManifest(run);
}

export async function artifactStream(id: string, name: string) {
  const path = artifactPath(id, name);
  const info = await stat(path);
  return { stream: createReadStream(path), bytes: info.size };
}
