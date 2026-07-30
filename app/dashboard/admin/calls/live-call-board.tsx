"use client";

import { useEffect, useRef, useState } from "react";

type QueueEntry = {
  attemptId: string;
  jobId: string;
  recipientName: string;
  maskedPhoneNumber: string;
  attemptNumber: number;
  maxAttempts: number;
  status: string;
  at: string;
};

type TranscriptLine = {
  speaker: "agent" | "recipient";
  text: string;
  spokenAt: string;
};

type LiveCall = Omit<QueueEntry, "at"> & {
  startedAt: string | null;
  transcript: TranscriptLine[];
};

type LiveState = {
  generatedAt: string;
  queues: { scheduled: QueueEntry[]; dispatching: QueueEntry[] };
  live: LiveCall[];
};

/** Fast enough to read as live, slow enough to leave the queue alone idle. */
const ON_CALL_POLL_MS = 2_000;
const IDLE_POLL_MS = 8_000;

export function LiveCallBoard() {
  const [state, setState] = useState<LiveState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onCall = (state?.live.length ?? 0) > 0;
  // The poll loop reschedules itself, so it reads the current call count
  // through a ref instead of restarting the effect on every response.
  const liveCountRef = useRef(0);
  useEffect(() => {
    liveCountRef.current = state?.live.length ?? 0;
  }, [state]);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function poll() {
      // A backgrounded console does not need to keep the queue awake.
      if (document.visibilityState === "hidden") {
        timer = setTimeout(poll, IDLE_POLL_MS);
        return;
      }
      try {
        const response = await fetch("/api/v1/admin/calls/live", {
          headers: { accept: "application/json" },
        });
        const body = (await response.json()) as
          | LiveState
          | { error?: { message?: string } };
        if (!active) return;
        if (!response.ok || !("live" in body)) {
          setError(
            ("error" in body ? body.error?.message : null) ??
              "Live call state is unavailable.",
          );
        } else {
          setState(body);
          setError(null);
        }
      } catch {
        if (active) setError("Live call state is unavailable.");
      }
      if (!active) return;
      timer = setTimeout(poll, nextDelay());
    }

    function nextDelay(): number {
      return liveCountRef.current > 0 ? ON_CALL_POLL_MS : IDLE_POLL_MS;
    }

    void poll();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, []);

  return (
    <section className="content-card live-call-card">
      <div className="call-log-heading">
        <div>
          <p className="kicker">Call automation queue</p>
          <h2>{onCall ? "A call is happening now." : "Nothing on the line."}</h2>
        </div>
        <span>
          {state
            ? `${state.queues.scheduled.length} scheduled · ${state.queues.dispatching.length} dispatching · ${state.live.length} on call`
            : "Loading…"}
        </span>
      </div>

      {error ? <p className="form-error">{error}</p> : null}

      {state?.live.map((call) => (
        <LiveTranscript call={call} key={call.attemptId} />
      ))}

      <div className="live-queue-grid">
        <QueueColumn
          title="Scheduled"
          hint="Waiting for the minute cron to enqueue."
          entries={state?.queues.scheduled ?? []}
        />
        <QueueColumn
          title="Dispatching"
          hint="Handed to the queue or accepted by Vapi."
          entries={state?.queues.dispatching ?? []}
        />
      </div>
    </section>
  );
}

function LiveTranscript({ call }: { call: LiveCall }) {
  const scroller = useRef<HTMLDivElement | null>(null);
  const elapsed = useElapsed(call.startedAt);

  useEffect(() => {
    const element = scroller.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [call.transcript.length]);

  return (
    <article className="live-call">
      <div className="live-call-header">
        <span className="live-dot" aria-hidden="true" />
        <strong>LIVE</strong>
        <span>
          {call.recipientName} · {call.maskedPhoneNumber}
        </span>
        <span>{call.status === "ringing" ? "ringing" : elapsed}</span>
      </div>
      <div className="live-transcript" ref={scroller} aria-live="polite">
        {call.transcript.length === 0 ? (
          <p className="live-transcript-waiting">Waiting for speech…</p>
        ) : (
          call.transcript.map((line) => (
            <p key={`${line.spokenAt}-${line.text}`}>
              <span
                className={
                  line.speaker === "agent"
                    ? "live-speaker agent"
                    : "live-speaker"
                }
              >
                {line.speaker === "agent" ? "AI" : "Pt"}
              </span>
              {line.text}
            </p>
          ))
        )}
      </div>
    </article>
  );
}

function QueueColumn({
  title,
  hint,
  entries,
}: {
  title: string;
  hint: string;
  entries: QueueEntry[];
}) {
  return (
    <div className="live-queue">
      <div className="live-queue-heading">
        <strong>{title}</strong>
        <span>{entries.length}</span>
      </div>
      <p className="live-queue-hint">{hint}</p>
      {entries.length === 0 ? (
        <p className="live-queue-empty">Empty.</p>
      ) : (
        <ul>
          {entries.map((entry) => (
            <li key={entry.attemptId}>
              <strong>{entry.recipientName}</strong>
              <span>
                {entry.maskedPhoneNumber} · attempt {entry.attemptNumber}/
                {entry.maxAttempts} · {label(entry.status)}
              </span>
              <span>{new Date(entry.at).toLocaleTimeString()}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function useElapsed(startedAt: string | null): string {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, []);
  if (!startedAt) return "connecting";
  const seconds = Math.max(
    0,
    Math.floor((now - new Date(startedAt).getTime()) / 1_000),
  );
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(
    seconds % 60,
  ).padStart(2, "0")}`;
}

function label(value: string): string {
  return value.replaceAll("_", " ");
}
