"use client";

import Link from "next/link";
import { Activity, Box, FolderClock } from "lucide-react";
import { AGENTS, PLATFORMS } from "@/lib/agents";
import { useHq } from "@/components/providers/HqProvider";

export function TopBar() {
  const { agents, hermes, platforms, routing } = useHq();
  const working = Object.values(agents).filter((agent) => agent.status !== "idle").length;
  return (
    <header className="topbar workspace-bar">
      <div className="brand-lockup glass">
        <div className="brand-mark" aria-hidden="true">
          <span>so</span>
          <i />
        </div>
        <div className="brand-copy">
          <div className="wordmark">sole</div>
          <div className="brand-subtitle">
            <span className="status-pulse" />
            Social workspace
          </div>
        </div>
        <div className="workspace-label">
          {routing ? routing.reason : "Today’s desk"}
        </div>
      </div>

      <div className="topbar-controls">
        {(Object.values(PLATFORMS) as (typeof PLATFORMS)[keyof typeof PLATFORMS][]).map(
          (p) => (
            <div
              key={p.id}
              className="platform-chip glass"
            >
              <span className="dot" style={{ color: p.color, background: p.color }} />
              <span className="platform-name">{p.name}</span>
              <span className="platform-state">{platforms[p.id].connected ? "Connected" : "Offline"}</span>
            </div>
          ),
        )}
        <Link href="/runs" className="hermes-chip glass" title="Task history and files">
          <FolderClock size={13} />
          <span>Files</span>
        </Link>
        <div className="hermes-chip glass">
          <span
            className="dot"
            style={{
              color: hermes.ok ? "#5ee0d0" : "#ff7a45",
              background: hermes.ok ? "#5ee0d0" : "#ff7a45",
            }}
          />
          <span>Assistant</span>
          <span className="hermes-state">{hermes.ok ? hermes.version || "ready" : "offline"}</span>
        </div>
      </div>
      <div className="mission-indicator glass">
        <Activity size={14} />
        <span className="mission-count">{working}</span>
        <span>{working === 1 ? "person working" : "people working"}</span>
      </div>
    </header>
  );
}

export function AgentStrip() {
  const { agents } = useHq();
  return (
    <div className="agent-strip">
      {Object.values(agents).map((agent) => {
        const meta = AGENTS[agent.id];
        return (
          <div
            key={agent.id}
            className={`agent-card glass agent-${agent.status}${
              agent.assigned ? "" : " agent-benched"
            }`}
          >
            <span className="agent-color" style={{ background: meta.color, boxShadow: `0 0 16px ${meta.color}` }} />
            <div className="agent-card-copy">
              <div className="agent-card-title">
                <span>{agent.name}</span>
                <Box size={12} strokeWidth={1.7} />
              </div>
              <div className="agent-card-detail">
                {!agent.assigned
                  ? "Not on this brief"
                  : agent.status === "idle"
                    ? meta.role
                    : agent.line}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
