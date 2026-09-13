"use client";

import { HqProvider } from "@/components/providers/HqProvider";
import { HqCanvas } from "@/components/hq/HqCanvas";
import { AgentStrip, TopBar } from "@/components/ui/TopBar";
import { ChatDock } from "@/components/ui/ChatDock";
import { ActivityRail, Toasts } from "@/components/ui/ActivityRail";

export default function Page() {
  return (
    <HqProvider>
      <main className="hq">
        <HqCanvas />
        <div className="vignette" />
        <div className="ui-layer">
          <TopBar />
          <Toasts />
          <ActivityRail />
          <ChatDock />
          <AgentStrip />
        </div>
      </main>
    </HqProvider>
  );
}
