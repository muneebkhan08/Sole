import { existsSync, readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { SOLE_SYSTEM_PROMPT } from "./prompts";

function readEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const idx = trimmed.indexOf("=");
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, "");
    out[key] = value;
  }
  return out;
}

function resolveHermesKey(): string {
  if (process.env.HERMES_API_KEY) return process.env.HERMES_API_KEY;
  const profile = readEnvFile(
    join(homedir(), ".hermes", "profiles", "social-army", ".env"),
  );
  if (profile.API_SERVER_KEY) return profile.API_SERVER_KEY;
  const root = readEnvFile(join(homedir(), ".hermes", ".env"));
  return root.API_SERVER_KEY || "";
}

const BASE = process.env.HERMES_API_BASE || "http://127.0.0.1:8642";
const SESSION = process.env.HERMES_SESSION_ID || "sole-hq";
const TASK_MODEL = process.env.HERMES_TASK_MODEL || "deepseek-v4-flash";
const TASK_PROVIDER = process.env.HERMES_TASK_PROVIDER || "deepseek";

// Cached, but re-read while absent so fixing the profile env recovers without
// restarting the server.
let cachedKey: string | null = null;

function key(): string {
  if (cachedKey) return cachedKey;
  const resolved = resolveHermesKey();
  if (resolved) cachedKey = resolved;
  return resolved;
}

function headers(): HeadersInit {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  const k = key();
  if (k) h.Authorization = `Bearer ${k}`;
  return h;
}

export function hermesConfigured(): { ok: boolean; error?: string } {
  if (!key()) return { ok: false, error: "HERMES_API_KEY is not set" };
  return { ok: true };
}

export async function hermesHealth(): Promise<{
  ok: boolean;
  version?: string;
  error?: string;
}> {
  try {
    const res = await fetch(`${BASE}/health`, {
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) {
      return { ok: false, error: `Hermes health ${res.status}` };
    }
    const data = (await res.json()) as { status?: string; version?: string };
    return { ok: data.status === "ok", version: data.version };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Hermes unreachable",
    };
  }
}

async function getSession(): Promise<boolean> {
  const res = await fetch(`${BASE}/api/sessions/${SESSION}`, {
    headers: headers(),
    cache: "no-store",
    signal: AbortSignal.timeout(6000),
  });
  return res.ok;
}

export async function ensureSoleSession(): Promise<string> {
  const exists = await getSession().catch(() => false);
  if (exists) return SESSION;

  const res = await fetch(`${BASE}/api/sessions`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      id: SESSION,
      title: "Sole HQ",
      source: "api_server",
      system_prompt: SOLE_SYSTEM_PROMPT,
      model: TASK_MODEL,
      provider: TASK_PROVIDER,
    }),
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok && res.status !== 409) {
    const text = await res.text();
    throw new Error(`Could not create Hermes session (${res.status}): ${text.slice(0, 240)}`);
  }
  return SESSION;
}

export async function streamSoleChat(
  input: string,
  signal?: AbortSignal,
): Promise<Response> {
  await ensureSoleSession();
  const res = await fetch(`${BASE}/api/sessions/${SESSION}/chat/stream`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      message: input,
      system_message: SOLE_SYSTEM_PROMPT,
      model: TASK_MODEL,
      provider: TASK_PROVIDER,
    }),
    // Client disconnect propagates to Hermes so a hung gateway cannot pin this
    // route open until maxDuration.
    signal,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Hermes chat failed (${res.status}): ${text.slice(0, 320)}`);
  }
  return res;
}

export { SESSION as SOLE_SESSION_ID, BASE as HERMES_BASE };
