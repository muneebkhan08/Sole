"use client";

import { useState } from "react";
import { World } from "./World";

export function HqCanvas() {
  const [ready, setReady] = useState(false);

  return (
    <div className={`scene ${ready ? "scene-ready" : ""}`}>
      <div className="scene-fallback" aria-hidden="true">
        <div className="fallback-table">
          <span />
          <span />
          <span />
          <span />
        </div>
        <div className="fallback-copy">Preparing the studio…</div>
      </div>
      <World onReady={() => setReady(true)} />
    </div>
  );
}
