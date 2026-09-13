"use client";

import { useEffect, useState } from "react";
import { Bell, ChevronRight, Sparkles } from "lucide-react";
import { AGENTS, PLATFORMS } from "@/lib/agents";
import { ArtifactTray } from "./ArtifactTray";
import { useHq } from "@/components/providers/HqProvider";

function ago(at: number) {
  const s = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  return `${m}m`;
}

/** Relative timestamps are computed at render, so they need a heartbeat. */
function useTick(ms: number) {
  const [, set] = useState(0);
  useEffect(() => {
    const id = setInterval(() => set((n) => n + 1), ms);
    return () => clearInterval(id);
  }, [ms]);
}

export function ActivityRail() {
  const { notifications, agents } = useHq();
  useTick(15000);
  const live = Object.values(agents).filter((a) => a.status !== "idle");

  return (
    <aside className="activity-rail glass">
      <div className="rail-heading">
        <div className="eyebrow">
          <Sparkles size={12} />
          Team activity
        </div>
        <div className="rail-title">
          {live.length ? `${live.length} people working` : "Nothing in progress"}
        </div>
      </div>
      <div className="telemetry-summary">
        <div><strong>{live.length}</strong><span>active</span></div>
        <div><strong>{notifications.length}</strong><span>signals</span></div>
        <div><strong>3</strong><span>channels</span></div>
      </div>
      <ArtifactTray />
      <div className="rail-feed scroll-thin">
        {notifications.length === 0 ? (
          <div className="empty-telemetry">
            <Bell size={18} />
            <p>Updates will appear here as the team moves through a brief.</p>
          </div>
        ) : (
          notifications.map((n) => {
            const color = n.agent ? AGENTS[n.agent].color : "var(--accent)";
            const platform = n.platform ? PLATFORMS[n.platform].name : null;
            return (
              <div key={n.id} className="signal-card">
                <div className="signal-meta">
                  <div className="signal-source">
                    <span className="dot" style={{ background: color, color }} />
                    {n.agent ?? "hq"}
                  </div>
                  <span>{ago(n.at)}</span>
                </div>
                <div className="signal-title">{n.title}</div>
                <div className="signal-body">{n.body}</div>
                {platform ? (
                  <div className="signal-platform">
                    {platform}<ChevronRight size={12} />
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}

export function Toasts() {
  const { toasts } = useHq();
  return (
    <div className="toast-stack" aria-live="polite">
      {toasts.map((t) => {
        const color = t.agent ? AGENTS[t.agent].color : "var(--accent)";
        return (
          <div key={t.id} className="toast glass">
            <div className="toast-title">
              <span className="dot" style={{ background: color, color }} />
              {t.title}
            </div>
            <div className="toast-body">{t.body}</div>
          </div>
        );
      })}
    </div>
  );
}
