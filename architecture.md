# Sole architecture

Sole is a command floor for a four-agent social team. Humans brief the team in chat. Next.js owns the UI and a thin Hermes bridge. Hermes (profile `social-army`) owns tools, memory, and the Reddit / Facebook / Instagram adapters already connected on this machine.

Poster **drafts and queues**. Publish happens only when the human says approve.

## Constraints

| Rule | Why |
|---|---|
| Platforms are Reddit, Facebook, Instagram only | Product scope. Hermes may have other networks; Sole never asks for them. |
| Four agents: Scrapper, Analyzer, Planner, Poster | One job each. The floor animates those four bodies. |
| Pipeline order is Scrapper → Analyzer → Planner → Poster | Unless the brief names a single role. Routed server-side in `lib/router.ts`. |
| Only routed agents work a brief | Unassigned agents stay benched on their pads. A tool heuristic never overrides the router; only an explicit `[[agent:]]` tag can pull an agent in. |
| Every task writes a run record | `~/.sole/runs/<taskId>/`, appended as it streams so a killed turn still leaves data. |
| Secrets stay on the server | `API_SERVER_KEY` is read from the Hermes profile env. The browser never sees it. |
| Session id is `sole-hq` | One persisted Hermes conversation for the HQ chat. |

## Runtime

```
Browser (Next.js HQ)
  │  POST /api/tasks   (SSE)
  │  GET  /api/status
  ▼
Next.js route handlers (Node)
  │  Bearer API_SERVER_KEY
  ▼
Hermes gateway  :8642
  profile: social-army
  session: sole-hq
  │
  ├─ tools / browser / web_search
  └─ Social Army MCP (accounts, drafts, campaigns)
        │
        ▼
     Reddit · Facebook · Instagram
```

Four processes matter in production:

1. **Postgres** (Social Army) — accounts, drafts, jobs
2. **Social Army worker / MCP** — session-based publish, never returns cookies
3. **Hermes gateway** (`hermes -p social-army gateway start`) — API server on `127.0.0.1:8642`
4. **Sole** (`npm run dev` / `next start`) — this repo

Sole does not talk to Playwright. Hermes + Social Army do.

## Agents

| Agent | Floor color | Job | Typical Hermes tools |
|---|---|---|---|
| Scrapper | copper | Collect public posts, comments, threads | `web_search`, `browser_*`, `list_accounts` |
| Analyzer | teal | Trends, hooks, sentiment | `get_metrics`, `recall_memory`, code |
| Planner | violet | Campaign / How-card | `upsert_campaign`, `upsert_action_plan` |
| Poster | magenta | Write-only copy + queue (skill poster, no-ai-slop; no images) | `queue_draft` (not `publish_post` unless approved) |

Stations on the 3D floor: Reddit (front), Facebook (left), Instagram (right), Analyzer wall (back), Planner board, Poster kiosk.

## Frontend

App Router. One screen.

```
app/page.tsx
  HqProvider          live agent + chat state
    HqCanvas          R3F floor (dynamic, no SSR)
    TopBar            Hermes + platform pills
    ChatDock          brief in, stream out
    ActivityRail      notify timeline
    Toasts            what just finished
    AgentStrip        four status chips
```

State lives in `components/providers/HqProvider.tsx`, split across **two** contexts:

| Context | Value | Changes on |
|---|---|---|
| `HqContext` | everything (chat, toasts, artifacts, routing) | every streamed token |
| `HqAgentsContext` | `agents` only | an agent actually moving |

The split is the hot path. The main context value is rebuilt on every
`assistant.delta` — i.e. per token — and the WebGL tree consumes agent state. If
`World` read the main context, the whole R3F tree would reconcile at token rate
during a stream. It reads `useHqAgents()` instead, and `Scene` is memoised on
that value, so the floor re-renders only when an agent changes status.

3D stack: `three` + `@react-three/fiber` + `@react-three/drei`. Agents roam with a walk cycle toward home pads or the station for their current status.

## Backend (Sole → Hermes)

| Route | Role |
|---|---|
| `GET /api/health` | Hermes liveness |
| `GET /api/status` | Hermes + agent roster + platform pills |
| `POST /api/tasks` | Start a turn; **SSE** of Sole events |
| `GET /api/runs` | Run history |
| `GET /api/runs/[id]` | Manifest + signals + tools + transcript |
| `GET /api/runs/[id]/[file]` | `signals.xlsx` (attachment) / `report.pdf` (inline) |

Auth: `HERMES_API_KEY`, or `API_SERVER_KEY` from `~/.hermes/profiles/social-army/.env`.

On each task:

1. Ensure session `sole-hq` exists (`POST /api/sessions`) with the Sole system prompt.
2. `POST /api/sessions/sole-hq/chat/stream` with the user brief plus pipeline instructions.
3. Translate Hermes SSE (`assistant.delta`, `tool.started`, `run.completed`, …) into Sole events.

Mapping lives in `lib/bridge.ts` and `lib/tool-map.ts`.

```
Hermes SSE                    Sole event                 UI
─────────────────────────     ──────────────────────     ──────────────────
run.started                   agent.status listening     walk to center
tool.started (web_search)     tool + agent working       Scrapper → station
[[agent:planner]] …           agent.status working       Planner speech
[[notify]] queued IG draft    notify                     toast + rail
assistant.delta               assistant.delta            chat stream
run.completed                 agent.status done          return to pads
```

Tagged lines Hermes is asked to emit:

```
[[agent:scrapper|analyzer|planner|poster]] <status>
[[platform:reddit|facebook|instagram]]
[[notify]] <one sentence>
[[signal]] {"platform":"reddit","title":"…","url":"https://…","score":128,…}
```

Tagged lines are parsed one COMPLETE line at a time (`takeCompleteLines` in `lib/tool-map.ts`). A half-streamed `[[signal]]` line is not valid JSON, so re-scanning the whole buffer per delta would corrupt rows.

## Task routing

`lib/router.ts` reads the brief and decides the roster before Hermes is called.

| Brief | Roster |
|---|---|
| "Only scrape r/SaaS for pricing complaints" | Scrapper |
| "Analyze the data you already collected" | Analyzer |
| "Draft posts from today's Reddit trends" | Scrapper → Analyzer → Planner → Poster |
| no stage named | all four |

One named role runs alone; several span shallowest→deepest; `already/existing` drops the collector. The roster goes into the prompt as a `ROSTER:` line and into the UI as `task.routed`, which benches everyone else.

## Run artifacts

Each run writes to `~/.sole/runs/<taskId>/` (override with `SOLE_RUNS_DIR`):

```
run.json          manifest: brief, roster, counts, usage, artifacts
events.ndjson     every SoleEvent, appended live
signals.ndjson    captured signals
unverified.ndjson quarantined [[signal]] lines
tools.ndjson      tool ledger (seq, ts, args)
transcript.md
signals.xlsx      Signals · Themes · Tools · Unverified · Malformed · Run
report.pdf        cover · roster · timeline · signals · outcome
```

Writes are **serialised per run** (`lib/runs.ts`). `appendEvent` is called
fire-and-forget from the stream, and concurrent `appendFile` calls to the same
file are not ordered — unserialised, the event log the report is built from
would scramble. `listRuns` orders by directory mtime and parses only the page it
returns, rather than reading every manifest on every request.

`signals.xlsx` is built only when the run captured something. A row without a resolvable `http(s)` URL is **not** listed on the Signals sheet — it goes to Unverified, so a spreadsheet's authority is never lent to a row nothing can be traced back to.

Viewing is in-app: `/runs` lists every run, `/runs/[id]` has Signals (filterable table), Timeline, Report (the PDF in an iframe) and Transcript. Browsers cannot render `.xlsx`, so the in-app table is rendered from `signals.ndjson` — the same source the workbook is built from — and the workbook itself is download-only.

## Event contract

`lib/types.ts` `SoleEvent`:

- `task.started` / `task.done`
- `agent.status` — drives 3D motion
- `notify` / `tool` — rail and toasts
- `assistant.delta` / `assistant.done` — chat
- `error`

The browser parses the same SSE framing (`event:` + `data:`) that the route writes (`lib/sse.ts`).

## Directory map

```
app/
  page.tsx                 HQ shell
  layout.tsx
  api/health|status|tasks  Hermes facade
components/
  hq/                      WebGL floor
  ui/                      chrome
  providers/HqProvider.tsx
lib/
  hermes.ts                gateway client
  bridge.ts                Hermes → Sole
  prompts.ts               system + wrapTask
  agents.ts                roster, homes, stations
  tool-map.ts              tool name → agent
architecture.md            this file
```

## Security boundary

```
[ browser ]
    no secrets, no Playwright
[ Next.js /api/* ]
    holds the gateway key
    streams redacted Hermes output
[ Hermes + Social Army ]
    vault, sessions, publish path
```

Do not log `API_SERVER_KEY`. Do not return session cookie paths. Poster must not call `publish_post` / `approve_post` unless the chat text is an explicit approve.

Run ids are validated as UUIDs on every read (`isRunId`). They are used as path
segments under `$HOME`, so without that check a crafted id is an arbitrary-file
-read primitive. Artifact filenames are matched against an allow-list. Run
records are redacted (`redact()`) before they touch disk.

## Known constraints

- **Hermes does not forward tool results** on `chat/stream`
  (`gateway/platforms/api_server.py` `_tool_progress` drops `**kwargs`), and
  `preview`/`args` are null on `tool.completed`. Signal capture therefore runs
  entirely through the `[[signal]]` line protocol, and the tool ledger carries
  values forward from the matching `tool.started`.
- **Tool→agent mapping is a heuristic and must never override the router.** A
  generic tool (`terminal`, `write_file`) attributed to an off-roster agent is
  credited to whoever is actually working. Only an explicit `[[agent:]]` tag can
  add someone to the roster.
- **One Hermes session** (`sole-hq`) is shared by every brief. Overlapping runs
  interrupt each other — Hermes answers `Operation interrupted.` on the loser —
  so `app/api/tasks` holds a process-wide single-flight lock and returns `409`
  with an explanatory SSE error frame instead of starting a second run. The
  browser's own `inFlight` ref only guards one tab.
- Run directories accumulate under `~/.sole/runs`; there is no retention policy.

## Local run

```bash
hermes -p social-army gateway start   # :8642
cd ~/Sole && npm run dev              # :3000
```

Optional `.env.local`: `HERMES_API_BASE`, `HERMES_API_KEY`, `HERMES_SESSION_ID`.
