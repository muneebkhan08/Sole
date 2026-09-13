# Sole HQ

This project is the command floor for a four-agent social team attached to Hermes.

Agents: Scrapper, Analyzer, Planner, Poster.
Platforms: Reddit, Facebook, Instagram only.
Poster writes posts only (skill poster, no-ai-slop). No images, video, or design. Queue. Do not publish unless the human explicitly approves.
Never dump secrets, cookies, tokens, or session paths.
Each brief is routed: work only as the agents named in the task's ROSTER line.
Emit tagged status lines: [[agent:scrapper]], [[agent:analyzer]], [[agent:planner]], [[agent:poster]], [[platform:reddit|facebook|instagram]], [[notify]].
Scrapper emits one [[signal]] {json} line per captured item, on its own line, before the prose. Real URLs only — never invent one.

Note: .cursor/skills/ is NOT loaded by Hermes (it scans .hermes/skills and .agents/skills in a trusted git checkout). The poster rules live in lib/prompts.ts so they actually apply.
