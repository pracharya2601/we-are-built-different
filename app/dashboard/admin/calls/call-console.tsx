"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

type CallLog = {
  id: string;
  recipientName: string;
  maskedPhoneNumber: string;
  status: string;
  outcome: string | null;
  attemptCount: number;
  maxAttempts: number;
  nextAttemptAt: string | null;
  createdAt: string;
  attempts: Array<{
    id: string;
    number: number;
    status: string;
    outcome: string | null;
    summary: string | null;
    selectedAvailability: string | null;
    failureMessage: string | null;
    scheduledAt: string;
    endedAt: string | null;
  }>;
};

export function CallConsole({ calls }: { calls: CallLog[] }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submitCall(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage(null);
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      const response = await fetch("/api/v1/admin/calls", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: data.get("name"),
          phoneNumber: data.get("phoneNumber"),
          dentalAvailability: data.get("dentalAvailability"),
          approvedContext: data.get("approvedContext"),
          timezone: data.get("timezone"),
          maxAttempts: Number(data.get("maxAttempts")),
          consentConfirmed: data.get("consentConfirmed") === "on",
        }),
      });
      const body = (await response.json()) as {
        call?: { id: string; status: string };
        error?: { message?: string };
      };
      if (!response.ok || !body.call) {
        throw new Error(body.error?.message ?? "The call could not be queued.");
      }
      setMessage(
        `Call ${body.call.id} is ${body.call.status}. The queue will run it outside this request.`,
      );
      form.reset();
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "The call could not be queued.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <section className="call-console-grid">
        <form className="content-card call-form" onSubmit={submitCall}>
          <div>
            <p className="kicker">New automation job</p>
            <h2>Queue an outbound call</h2>
          </div>

          <label className="field-label" htmlFor="call-recipient-name">
            Recipient name
          </label>
          <input
            id="call-recipient-name"
            name="name"
            minLength={2}
            maxLength={120}
            required
          />

          <label className="field-label" htmlFor="call-phone-number">
            Phone number (E.164)
          </label>
          <input
            id="call-phone-number"
            name="phoneNumber"
            inputMode="tel"
            placeholder="+14155550123"
            pattern="^\+[1-9][0-9]{7,14}$"
            required
          />

          <label className="field-label" htmlFor="call-availability">
            Dental availability
          </label>
          <textarea
            id="call-availability"
            name="dentalAvailability"
            maxLength={2_000}
            placeholder="Example: July 31 at 10:00 AM or 2:30 PM"
            required
          />

          <label className="field-label" htmlFor="call-context">
            Approved context
          </label>
          <textarea
            id="call-context"
            name="approvedContext"
            maxLength={2_000}
            placeholder="Only the minimum information the agent needs."
          />

          <div className="call-form-row">
            <label>
              <span className="field-label">Recipient timezone</span>
              <input
                name="timezone"
                defaultValue="America/Los_Angeles"
                required
              />
            </label>
            <label>
              <span className="field-label">Maximum attempts</span>
              <select name="maxAttempts" defaultValue="3">
                <option value="1">1 attempt</option>
                <option value="2">2 attempts</option>
                <option value="3">3 attempts</option>
                <option value="4">4 attempts</option>
                <option value="5">5 attempts</option>
              </select>
            </label>
          </div>

          <label className="call-consent">
            <input name="consentConfirmed" type="checkbox" required />
            <span>
              Documented permission exists for this automated call. Stop and
              do-not-call requests will be treated as terminal outcomes.
            </span>
          </label>

          {message ? <p className="workspace-message">{message}</p> : null}
          <button
            className="button button-primary"
            disabled={submitting}
            type="submit"
          >
            {submitting ? "Queuing…" : "Queue call"}
          </button>
        </form>

        <aside className="content-card call-safety-card">
          <p className="kicker">Execution boundary</p>
          <h2>The web request stays fast.</h2>
          <ol>
            <li>Validate owner access and consent.</li>
            <li>Encrypt the recipient packet in D1.</li>
            <li>Send internal job IDs to Cloudflare Queues.</li>
            <li>The queue Worker starts Vapi and records callbacks.</li>
          </ol>
          <p>
            Transcripts and recordings are intentionally not copied into the
            platform log.
          </p>
        </aside>
      </section>

      <section className="content-card call-log-card">
        <div className="call-log-heading">
          <div>
            <p className="kicker">Platform-owner access</p>
            <h2>Call log</h2>
          </div>
          <span>{calls.length} recent jobs</span>
        </div>
        {calls.length === 0 ? (
          <div className="empty-state">
            <strong>No call jobs yet.</strong>
            <p>The first queued call will appear here immediately.</p>
          </div>
        ) : (
          <div className="call-log-list">
            {calls.map((call) => (
              <article className="call-log-row" key={call.id}>
                <div className="call-log-summary">
                  <div>
                    <strong>{call.recipientName}</strong>
                    <span>
                      {call.maskedPhoneNumber} ·{" "}
                      {new Date(call.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <div>
                    <span
                      className={`status-pill ${
                        ["review_required", "exhausted"].includes(call.status)
                          ? "warning"
                          : ""
                      }`}
                    >
                      {label(call.status)}
                    </span>
                    <small>
                      {call.outcome ? label(call.outcome) : "Awaiting outcome"} ·{" "}
                      {call.attemptCount}/{call.maxAttempts} attempts
                    </small>
                  </div>
                </div>
                <details>
                  <summary>Attempt history</summary>
                  <div className="call-attempt-list">
                    {call.attempts.map((attempt) => (
                      <div key={attempt.id}>
                        <strong>
                          Attempt {attempt.number} · {label(attempt.status)}
                        </strong>
                        <span>
                          {attempt.outcome
                            ? label(attempt.outcome)
                            : "No outcome yet"}
                          {attempt.selectedAvailability
                            ? ` · ${attempt.selectedAvailability}`
                            : ""}
                        </span>
                        {attempt.summary ? <p>{attempt.summary}</p> : null}
                        {attempt.failureMessage ? (
                          <p className="form-error">
                            {attempt.failureMessage}
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </details>
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

function label(value: string): string {
  return value.replaceAll("_", " ").replaceAll("-", " ");
}
