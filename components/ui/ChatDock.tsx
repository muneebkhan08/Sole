"use client";

import { FormEvent, useRef, useState } from "react";
import { ArrowUp, CornerDownLeft, LoaderCircle, Sparkles } from "lucide-react";
import { SUGGESTIONS } from "@/lib/agents";
import { stripSoleTags } from "@/lib/tool-map";
import { useHq } from "@/components/providers/HqProvider";

export function ChatDock() {
  const { messages, streaming, busy, send } = useHq();
  const [draft, setDraft] = useState("");
  const scroller = useRef<HTMLDivElement>(null);

  const onSubmit = async (event?: FormEvent) => {
    event?.preventDefault();
    const text = draft.trim();
    // Clearing before the busy guard in send() silently threw the draft away.
    if (!text || busy) return;
    setDraft("");
    await send(text);
    requestAnimationFrame(() => {
      scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
    });
  };

  return (
    <section className="chat-dock glass">
      <div className="chat-heading">
        <div>
          <div className="eyebrow">
            <Sparkles size={12} />
            Start a brief
          </div>
          <div className="chat-title">
            What should the team work on? <span>Research · shape · draft</span>
          </div>
        </div>
        {busy ? (
          <div className="working-chip"><LoaderCircle size={13} className="animate-spin" /> In progress</div>
        ) : <div className="ready-chip"><span className="status-pulse" /> Available</div>}
      </div>

      <div
        ref={scroller}
        className="chat-feed scroll-thin"
      >
        {messages.map((m) => {
          const text = m.role === "assistant" ? stripSoleTags(m.text) : m.text;
          if (!text) return null;
          return (
          <div
            key={m.id}
            className={
              m.role === "user"
                ? "message message-user"
                : m.role === "system"
                  ? "message message-system"
                  : "message message-agent"
            }
          >
            {text}
          </div>
          );
        })}
        {streaming ? (
          <div className="message message-agent">
            {stripSoleTags(streaming)}
            <span className="ml-1 inline-block h-3 w-1.5 animate-pulse bg-[var(--accent)]" />
          </div>
        ) : null}
      </div>

      {!busy && messages.length < 3 ? (
        <div className="suggestion-row">
          {SUGGESTIONS.slice(0, 3).map((s) => (
            <button
              key={s}
              type="button"
              className="suggestion"
              onClick={() => send(s)}
            >
              {s}
            </button>
          ))}
        </div>
      ) : null}

      <form onSubmit={onSubmit} className="chat-composer">
        <textarea
          value={draft}
          rows={2}
          placeholder="Ask for research, a content plan, or a draft…"
          aria-label="Task brief"
          className="mission-input"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void onSubmit();
            }
          }}
        />
        <button
          type="submit"
          disabled={busy || !draft.trim()}
          aria-label="Send task brief"
          className="send-button"
        >
          <ArrowUp className="h-4 w-4" />
        </button>
        <span className="shortcut"><CornerDownLeft size={12} /> Send</span>
      </form>
    </section>
  );
}
