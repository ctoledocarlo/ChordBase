"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "@/lib/setlists";
import { ChevronIcon } from "./icons";
import { ROLES, type ScreenRole } from "./use-screen-role";

const label = (role: string) => ROLES.find((r) => r.value === role)?.label ?? role;

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

/**
 * A small chat for the screens showing a setlist, so Media can tell the band "capo up one" without
 * talking over the music. Viewer screens can read it but not write. It can be folded away; a dot
 * shows when something new came in while it was.
 */
export function SetlistChat({
  messages,
  role,
  screenId,
  onSend,
}: {
  messages: ChatMessage[];
  role: ScreenRole;
  screenId: string;
  /** Sends a message; returns an error to show, or null when it went through. */
  onSend: (text: string) => Promise<string | null>;
}) {
  const [open, setOpen] = useState(true);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [seen, setSeen] = useState(messages.length);
  const list = useRef<HTMLDivElement>(null);

  // Everything counts as read while the chat is open.
  if (open && seen !== messages.length) setSeen(messages.length);
  const unread = open ? 0 : messages.slice(seen).filter((m) => m.sender !== screenId).length;

  // Stay at the newest message.
  useEffect(() => {
    const el = list.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, open]);

  async function send() {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    const problem = await onSend(text);
    setSending(false);
    if (problem) setError(problem);
    else setDraft("");
  }

  return (
    <section aria-label="Session chat" className={`flex flex-col border-t border-line pt-2 ${open ? "min-h-[9rem] flex-[2]" : "flex-none"}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full flex-none items-center gap-1.5 text-left text-xs font-medium uppercase tracking-wide text-muted hover:text-foreground"
      >
        <span className={`transition-transform ${open ? "" : "-rotate-90"}`}>
          <ChevronIcon />
        </span>
        Chat
        {unread > 0 && (
          <span className="rounded-full bg-accent px-1.5 text-[0.6875rem] font-semibold normal-case leading-4 text-background">
            {unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div ref={list} className="mt-2 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
            {messages.length === 0 && <p className="text-sm text-muted">No messages yet.</p>}
            {messages.map((m) => {
              const mine = m.sender === screenId;
              return (
                <div key={m.id} className={mine ? "text-right" : ""}>
                  <p className="text-[0.6875rem] text-muted">
                    {mine ? "You" : label(m.sender_role)} · {time(m.created_at)}
                  </p>
                  <p
                    className={`inline-block max-w-full whitespace-pre-wrap break-words rounded-lg px-2.5 py-1 text-left text-sm ${
                      mine ? "bg-foreground text-background" : "bg-hover"
                    }`}
                  >
                    {m.body}
                  </p>
                </div>
              );
            })}
          </div>

          {role === "viewer" ? (
            <p className="mt-2 flex-none text-xs text-muted">Viewers can read the chat.</p>
          ) : (
            <form
              className="mt-2 flex flex-none gap-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                void send();
              }}
            >
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                maxLength={500}
                placeholder="Message"
                aria-label="Chat message"
                autoComplete="off"
                className="field field-sm min-w-0 flex-1"
              />
              <button type="submit" className="btn" disabled={sending || !draft.trim()}>
                Send
              </button>
            </form>
          )}
          {error && (
            <p role="alert" className="mt-1 flex-none text-xs text-danger">
              {error}
            </p>
          )}
        </>
      )}
    </section>
  );
}
