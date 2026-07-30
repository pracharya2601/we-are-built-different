"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import styles from "./demo.module.css";

const stages = [
  { key: "open-slot", label: "Open slot", actor: "Clinic" },
  { key: "patients-selected", label: "Patient selected", actor: "Nonprofit" },
  { key: "funding", label: "Funding approval", actor: "Sponsor" },
  { key: "calling", label: "Calling patient", actor: "Operator" },
  { key: "accepted", label: "Patient accepted", actor: "Operator" },
  { key: "payment", label: "Payment", actor: "Patient" },
  { key: "filled", label: "Chair filled", actor: "Everyone" },
] as const;

type StageKey = (typeof stages)[number]["key"];
type TranscriptLine = { speaker: "Agent" | "Patient"; text: string };
type ApiRecord = Record<string, unknown>;

type Workflow = {
  stage: StageKey;
  sponsorStatus: string;
  callStatus: string;
  callOutcome: string | null;
  callSeconds: number;
  transcript: TranscriptLine[];
  patientPaymentStatus: string;
  paymentLinkSent: boolean;
  visitCompleted: boolean;
};

const initialWorkflow: Workflow = {
  stage: "open-slot",
  sponsorStatus: "not_started",
  callStatus: "not_started",
  callOutcome: null,
  callSeconds: 0,
  transcript: [],
  patientPaymentStatus: "not_started",
  paymentLinkSent: false,
  visitCompleted: false,
};

const patient = {
  id: "maria",
  name: "Maria Delgado",
  phone: "+1 709-765-6030",
  apiPhone: "+17097656030",
};

function record(value: unknown): ApiRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as ApiRecord)
    : {};
}

function text(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function normalizeStage(value: unknown): StageKey {
  if (typeof value === "number") {
    return stages[Math.max(0, Math.min(stages.length - 1, value))]?.key ?? "open-slot";
  }
  const normalized = String(value ?? "")
    .toLowerCase()
    .replaceAll("_", "-");
  const aliases: Record<string, StageKey> = {
    published: "patients-selected",
    "patient-selected": "funding",
    funded: "calling",
    "call-ready": "calling",
    "call-in-progress": "calling",
    accepted: "accepted",
    "payment-pending": "payment",
    confirmed: "filled",
    completed: "filled",
  };
  return stages.some((stage) => stage.key === normalized)
    ? (normalized as StageKey)
    : (aliases[normalized] ?? "open-slot");
}

function normalizeTranscript(value: unknown): TranscriptLine[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const item = record(entry);
    const body = text(item.text ?? item.message, "");
    if (!body) return [];
    const rawSpeaker = text(item.speaker ?? item.role, "Agent").toLowerCase();
    return [{
      speaker:
        rawSpeaker.includes("patient") ||
        rawSpeaker === "user" ||
        rawSpeaker === "recipient"
          ? "Patient"
          : "Agent",
      text: body,
    }];
  });
}

function normalizeWorkflow(payload: unknown): Workflow {
  const root = record(payload);
  const data = Object.keys(record(root.workflow)).length ? record(root.workflow) : root;
  const sponsor = record(data.sponsorPayment ?? data.sponsor_payment);
  const call = record(data.call);
  const patientPayment = record(data.patientPayment ?? data.patient_payment);
  const visit = record(data.visit);

  return {
    stage: normalizeStage(data.stage ?? data.stageKey ?? data.stageIndex),
    sponsorStatus: text(sponsor.status ?? data.sponsorPaymentStatus, "not_started").toLowerCase(),
    callStatus: text(call.status ?? data.callStatus, "not_started").toLowerCase(),
    callOutcome:
      typeof (call.outcome ?? data.callOutcome) === "string"
        ? String(call.outcome ?? data.callOutcome).toLowerCase()
        : null,
    callSeconds:
      typeof (call.durationSeconds ?? data.callSeconds) === "number"
        ? Number(call.durationSeconds ?? data.callSeconds)
        : 0,
    transcript: normalizeTranscript(call.transcript ?? data.transcript),
    patientPaymentStatus: text(
      patientPayment.status ?? data.patientPaymentStatus,
      "not_started",
    ).toLowerCase(),
    paymentLinkSent: Boolean(patientPayment.linkSent ?? data.paymentLinkSent),
    visitCompleted: Boolean(data.visitCompleted ?? visit.completed),
  };
}

async function readJson(response: Response): Promise<ApiRecord> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const details = record(body);
    const nestedError = record(details.error);
    throw new Error(
      text(
        nestedError.message ?? details.message ?? details.error,
        `Request failed (${response.status})`,
      ),
    );
  }
  return record(body);
}

export function DemoDashboard() {
  const [workflow, setWorkflow] = useState<Workflow>(initialWorkflow);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (quiet = false) => {
    try {
      const response = await fetch("/api/demo/workflow", {
        cache: "no-store",
        headers: { accept: "application/json" },
      });
      const body = await readJson(response);
      setWorkflow(normalizeWorkflow(body));
      setError(null);
    } catch (cause) {
      if (!quiet) setError(cause instanceof Error ? cause.message : "Could not load the workflow.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialRefresh = window.setTimeout(() => void refresh(), 0);
    const interval = window.setInterval(() => void refresh(true), 2500);
    return () => {
      window.clearTimeout(initialRefresh);
      window.clearInterval(interval);
    };
  }, [refresh]);

  const post = useCallback(
    async (action: string, url: string, body?: ApiRecord, openCheckout = false) => {
      setPending(action);
      setError(null);
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json", accept: "application/json" },
          body: JSON.stringify(body ?? {}),
        });
        const result = await readJson(response);
        const checkoutUrl = result.checkoutUrl ?? result.url;
        if (openCheckout) {
          if (typeof checkoutUrl !== "string" || !checkoutUrl) {
            throw new Error("The server did not return a checkout URL.");
          }
          window.location.assign(checkoutUrl);
          return;
        }
        await refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "The action could not be completed.");
      } finally {
        setPending(null);
      }
    },
    [refresh],
  );

  const stageIndex = Math.max(
    0,
    stages.findIndex((stage) => stage.key === workflow.stage),
  );
  const activeCall = ["queued", "ringing", "in_progress", "in-progress", "connected"].includes(
    workflow.callStatus,
  );
  const status = workflow.callOutcome ?? workflow.callStatus;
  const formattedDuration = `${String(Math.floor(workflow.callSeconds / 60)).padStart(2, "0")}:${String(workflow.callSeconds % 60).padStart(2, "0")}`;
  const actionDisabled = Boolean(pending);

  const currentPanel = useMemo(() => {
    const actionButton = (
      label: string,
      action: string,
      url: string,
      body?: ApiRecord,
      checkout = false,
      disabled = false,
    ) => (
      <button
        type="button"
        className={styles.primaryButton}
        disabled={actionDisabled || disabled}
        onClick={() => void post(action, url, body, checkout)}
      >
        {pending === action ? "Working…" : label}
      </button>
    );

    switch (workflow.stage) {
      case "open-slot":
        return (
          <>
            <p className={styles.eyebrow}>Clinic action</p>
            <h2>Publish this open slot</h2>
            <div className={styles.moneyList}>
              <SummaryRow label="Appointment" value="Today · 3:00 PM" />
              <SummaryRow label="Treatment" value="Cleaning + exam" />
              <SummaryRow label="Discounted price" value="$80" />
              <SummaryRow label="Sponsor requested" value="$60" accent />
              <SummaryRow label="Patient contribution" value="$20" />
            </div>
            {actionButton("Publish OpenChair Slot", "publish", "/api/demo/workflow/publish")}
          </>
        );
      case "patients-selected":
        return (
          <>
            <p className={styles.eyebrow}>Nonprofit action</p>
            <h2>Select who may be called</h2>
            <div className={styles.patientCard}>
              <span className={styles.check}>✓</span>
              <div>
                <strong>{patient.name}</strong>
                <small>Verified demo patient</small>
                <b>{patient.phone}</b>
              </div>
            </div>
            <p className={styles.note}>This is the only patient configured for the live demo call.</p>
            {actionButton(
              "Approve Patient Outreach",
              "select-patient",
              "/api/demo/workflow/select-patient",
              { patientId: patient.id, phone: patient.apiPhone },
            )}
          </>
        );
      case "funding":
        return (
          <>
            <p className={styles.eyebrow}>Sponsor action</p>
            <h2>Funding approval</h2>
            <div className={styles.moneyList}>
              <SummaryRow label="Total care" value="$80" />
              <SummaryRow label="Patient contribution" value="$20" />
              <SummaryRow label="Sponsor contribution" value="$60" accent />
              <SummaryRow label="Stripe status" value={workflow.sponsorStatus} status />
            </div>
            {actionButton(
              workflow.sponsorStatus === "paid" ? "Funding confirmed" : "Pay $60 with Stripe",
              "sponsor-checkout",
              "/api/demo/payments/sponsor/checkout",
              {},
              true,
              workflow.sponsorStatus === "paid",
            )}
            <p className={styles.note}>The workflow advances only after Stripe confirms payment.</p>
          </>
        );
      case "calling":
        return (
          <>
            <p className={styles.eyebrow}>Operator view</p>
            <h2>OpenChair agent call</h2>
            <div className={styles.callHeader}>
              <div>
                <strong>{patient.name}</strong>
                <small>{patient.phone}</small>
              </div>
              <div className={styles.callStatus}>
                <Status value={status} />
                <b>{formattedDuration}</b>
              </div>
            </div>
            <p className={styles.eyebrow}>Live transcription</p>
            <div className={styles.transcript} aria-live="polite">
              {workflow.transcript.length ? (
                workflow.transcript.map((line, index) => (
                  <div key={`${index}-${line.text}`}>
                    <strong>{line.speaker}</strong>
                    <p>{line.text}</p>
                  </div>
                ))
              ) : (
                <p>The real transcript will appear here after the Vapi call connects.</p>
              )}
            </div>
            {actionButton(
              `Call ${patient.phone}`,
              "start-call",
              "/api/demo/calls",
              { patientId: patient.id },
              false,
              activeCall || ["completed", "accepted"].includes(workflow.callStatus),
            )}
            <p className={styles.note}>Status, outcome, and transcript come from Vapi callbacks.</p>
          </>
        );
      case "accepted":
        return (
          <>
            <p className={styles.eyebrow}>Operator action</p>
            <h2>Patient accepted</h2>
            <div className={styles.acceptedCard}>
              <strong>{patient.name}</strong>
              <small>{patient.phone}</small>
              <p>Accepted for Today · 3:00 PM</p>
            </div>
            <div className={styles.moneyList}>
              <SummaryRow label="Sponsor paid" value="$60" accent />
              <SummaryRow label="Patient contribution due" value="$20" />
            </div>
            {actionButton(
              "Create & Open $20 Payment Link",
              "patient-checkout",
              "/api/demo/payments/patient/checkout",
              { patientId: patient.id },
              true,
            )}
          </>
        );
      case "payment":
        return (
          <>
            <p className={styles.eyebrow}>Payment</p>
            <h2>Collecting the chair</h2>
            <div className={styles.moneyList}>
              <SummaryRow label="Sponsor" value={workflow.sponsorStatus} status />
              <SummaryRow label="Patient" value={workflow.patientPaymentStatus} status />
              <SummaryRow label="Payment link" value={workflow.paymentLinkSent ? "Sent" : "Ready"} />
            </div>
            {actionButton(
              workflow.patientPaymentStatus === "paid"
                ? "Patient payment confirmed"
                : "Open Patient Payment",
              "patient-checkout",
              "/api/demo/payments/patient/checkout",
              { patientId: patient.id },
              true,
              workflow.patientPaymentStatus === "paid",
            )}
            <p className={styles.note}>The chair fills only after Stripe confirms both payments.</p>
          </>
        );
      default:
        return (
          <>
            <p className={styles.eyebrow}>Complete</p>
            <h2>OpenChair filled</h2>
            <p className={styles.filledMessage}>
              {patient.name} is confirmed for Today · 3:00 PM.
            </p>
            <div className={styles.moneyList}>
              <SummaryRow label="Total care funded" value="$80" accent />
              <SummaryRow label="Sponsor paid" value="$60" />
              <SummaryRow label="Patient paid" value="$20" />
            </div>
            {actionButton(
              workflow.visitCompleted ? "Visit completed" : "Mark Visit Completed",
              "complete",
              "/api/demo/workflow/complete",
              {},
              false,
              workflow.visitCompleted,
            )}
          </>
        );
    }
  }, [actionDisabled, activeCall, formattedDuration, pending, post, status, workflow]);

  return (
    <main className={styles.page}>
      <div className={styles.dashboard}>
        <aside className={styles.summary}>
          <div>
            <Link href="/" className={styles.brand}>
              <span>OC</span> OpenChair
            </Link>
            <p className={styles.eyebrow}>Appointment</p>
            <h1>One chair. One live workflow.</h1>
            <dl>
              <SummaryDefinition label="Clinic" value="Mission Community Dental" />
              <SummaryDefinition label="Treatment" value="Cleaning + exam" />
              <SummaryDefinition label="Date & time" value="Today · 3:00 PM" />
              <SummaryDefinition label="Patient" value={patient.name} />
            </dl>
          </div>
          <div className={styles.split}>
            <SummaryRow label="Full price" value="$80" />
            <SummaryRow label="Sponsor amount" value="$60" accent />
            <SummaryRow label="Patient amount" value="$20" />
          </div>
        </aside>

        <section className={styles.workspace}>
          <header className={styles.header}>
            <div>
              <p className={styles.eyebrow}>Live demo · Appointment #A-2291</p>
              <strong>Backend-driven MVP</strong>
            </div>
            <button type="button" className={styles.refreshButton} onClick={() => void refresh()}>
              Refresh status
            </button>
          </header>

          <ol className={styles.stageFlow} aria-label="Workflow progress">
            {stages.map((stage, index) => (
              <li
                key={stage.key}
                className={
                  index < stageIndex
                    ? styles.completedStage
                    : index === stageIndex
                      ? styles.activeStage
                      : ""
                }
                aria-current={index === stageIndex ? "step" : undefined}
              >
                <span>{index < stageIndex ? "✓" : index + 1}</span>
                <strong>{stage.label}</strong>
                <small>{stage.actor}</small>
              </li>
            ))}
          </ol>

          {error ? (
            <div className={styles.error} role="alert">
              <strong>Could not complete that request.</strong>
              <span>{error}</span>
              <button type="button" onClick={() => void refresh()}>
                Try again
              </button>
            </div>
          ) : null}

          <article className={styles.actionPanel}>
            {loading ? <p className={styles.loading}>Loading live workflow…</p> : currentPanel}
          </article>
        </section>
      </div>
    </main>
  );
}

function SummaryDefinition({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  accent = false,
  status = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
  status?: boolean;
}) {
  return (
    <div className={styles.summaryRow}>
      <span>{label}</span>
      {status ? <Status value={value} /> : <strong className={accent ? styles.accent : ""}>{value}</strong>}
    </div>
  );
}

function Status({ value }: { value: string }) {
  const positive = ["paid", "accepted", "completed"].includes(value.toLowerCase());
  return (
    <span className={`${styles.statusPill} ${positive ? styles.positive : ""}`}>
      {value.replaceAll("_", " ")}
    </span>
  );
}
