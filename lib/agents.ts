import type { AgentId, AgentState, PlatformId } from "./types";

export const AGENTS: Record<
  AgentId,
  {
    id: AgentId;
    name: string;
    role: string;
    color: string;
    glow: string;
    verb: string;
  }
> = {
  scrapper: {
    id: "scrapper",
    name: "Scrapper",
    role: "Collects posts, comments, and signals",
    color: "#b86a4f",
    glow: "#deb29f",
    verb: "scraping",
  },
  analyzer: {
    id: "analyzer",
    name: "Analyzer",
    role: "Reads trends, hooks, and sentiment",
    color: "#3d877d",
    glow: "#a9d1ca",
    verb: "analyzing",
  },
  planner: {
    id: "planner",
    name: "Planner",
    role: "Turns insight into a campaign",
    color: "#766ba8",
    glow: "#c7c0df",
    verb: "planning",
  },
  poster: {
    id: "poster",
    name: "Poster",
    role: "Writes posts and queues them",
    color: "#b45f79",
    glow: "#d9b0bd",
    verb: "posting",
  },
};

export const PLATFORMS: Record<
  PlatformId,
  { id: PlatformId; name: string; color: string; handle: string }
> = {
  reddit: { id: "reddit", name: "Reddit", color: "#ba6044", handle: "r/" },
  facebook: { id: "facebook", name: "Facebook", color: "#547db3", handle: "fb/" },
  instagram: { id: "instagram", name: "Instagram", color: "#bd6a5b", handle: "ig/" },
};

export const HOME: Record<AgentId, [number, number]> = {
  scrapper: [2.4, 2.6],
  analyzer: [-2.4, 2.6],
  planner: [-2.4, -2.4],
  poster: [2.4, -2.4],
};

export const STATIONS: Record<string, [number, number]> = {
  reddit: [0, 8.2],
  facebook: [-8.6, -1.6],
  instagram: [8.6, -1.6],
  analyze: [0, -8.4],
  plan: [-8.4, 6.2],
  post: [8.4, 6.2],
  center: [0, 0],
};

export function initialAgents(): Record<AgentId, AgentState> {
  return {
    scrapper: {
      id: "scrapper",
      name: AGENTS.scrapper.name,
      role: AGENTS.scrapper.role,
      status: "idle",
      line: "Waiting for a brief",
      assigned: true,
    },
    analyzer: {
      id: "analyzer",
      name: AGENTS.analyzer.name,
      role: AGENTS.analyzer.role,
      status: "idle",
      line: "Watching the floor",
      assigned: true,
    },
    planner: {
      id: "planner",
      name: AGENTS.planner.name,
      role: AGENTS.planner.role,
      status: "idle",
      line: "Board is clear",
      assigned: true,
    },
    poster: {
      id: "poster",
      name: AGENTS.poster.name,
      role: AGENTS.poster.role,
      status: "idle",
      line: "Queue is empty",
      assigned: true,
    },
  };
}

export const SUGGESTIONS = [
  "Scrape trending AI-tool threads on Reddit and tell me what is catching fire.",
  "Analyze recent Instagram comments and pull the top three content angles.",
  "Plan a 3-day Reddit + Instagram campaign around a product launch.",
  "Draft Facebook and Instagram posts from today's Reddit trends. Queue only — do not publish.",
];
