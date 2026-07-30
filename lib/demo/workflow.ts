import { and, desc, eq } from "drizzle-orm";

import type { AppDatabase } from "../../db";
import {
  callAttempts,
  callJobs,
  openchairCandidates,
  openchairPayments,
  openchairWorkflows,
} from "../../db/schema";
import {
  getCallDataEncryptionKey,
  getCallRuntimeEnvironment,
  listCallTranscriptLines,
  revealCallTranscriptText,
} from "../calls";
import { createId } from "../data/ids";
import { commitWorkflowFact } from "../openchair/workflow/repository";
import {
  DEMO_APPOINTMENT,
  DEMO_PATIENT,
  getOrCreateDemoRun,
} from "./state";

export type DemoWorkflowStage =
  | "open-slot"
  | "patients-selected"
  | "funding"
  | "calling"
  | "accepted"
  | "payment"
  | "filled";

export async function readDemoWorkflowSnapshot(
  db: AppDatabase,
  input: { workspaceId: string; userId: string },
) {
  const run = await getOrCreateDemoRun(db, input);
  await reconcileAcceptedCall(db, run);

  const [workflow, payments, job, attempt] = await Promise.all([
    db
      .select()
      .from(openchairWorkflows)
      .where(
        and(
          eq(openchairWorkflows.workspaceId, input.workspaceId),
          eq(openchairWorkflows.appointmentId, run.appointmentId),
        ),
      )
      .limit(1)
      .then((rows) => rows[0]),
    db
      .select()
      .from(openchairPayments)
      .where(
        and(
          eq(openchairPayments.workspaceId, input.workspaceId),
          eq(openchairPayments.appointmentId, run.appointmentId),
        ),
      ),
    run.callJobId
      ? db
          .select()
          .from(callJobs)
          .where(
            and(
              eq(callJobs.id, run.callJobId),
              eq(callJobs.workspaceId, input.workspaceId),
            ),
          )
          .limit(1)
          .then((rows) => rows[0])
      : Promise.resolve(undefined),
    run.callJobId
      ? db
          .select()
          .from(callAttempts)
          .where(
            and(
              eq(callAttempts.jobId, run.callJobId),
              eq(callAttempts.workspaceId, input.workspaceId),
            ),
          )
          .orderBy(desc(callAttempts.attemptNumber))
          .limit(1)
          .then((rows) => rows[0])
      : Promise.resolve(undefined),
  ]);

  if (!workflow) throw new Error("The demo workflow could not be created.");

  const transcript =
    attempt &&
    ["ringing", "in_progress"].includes(attempt.status)
      ? await readTranscript(db, attempt.id)
      : [];
  const sponsor = payments.find((payment) => payment.payerType === "sponsor");
  const patient = payments.find((payment) => payment.payerType === "patient");

  return {
    appointmentId: run.appointmentId,
    workflowVersion: workflow.version,
    stage: presentStage(workflow.stage),
    selectedPatientId:
      workflow.stage === "OPEN_SLOT" ? null : DEMO_PATIENT.id,
    appointment: {
      clinic: DEMO_APPOINTMENT.clinicName,
      treatment: DEMO_APPOINTMENT.treatmentType,
      fullPrice: DEMO_APPOINTMENT.fullPrice,
      sponsorAmount: DEMO_APPOINTMENT.sponsorAmount,
      patientAmount: DEMO_APPOINTMENT.patientAmount,
    },
    patient: {
      id: DEMO_PATIENT.id,
      name: DEMO_PATIENT.name,
      phone: DEMO_PATIENT.phoneNumber,
      language: DEMO_PATIENT.language,
    },
    sponsorPayment: { status: presentPaymentStatus(sponsor?.status) },
    patientPayment: {
      status: presentPaymentStatus(patient?.status),
      linkSent: Boolean(patient?.providerCheckoutSessionId),
    },
    call: {
      status: attempt?.status ?? job?.status ?? "idle",
      outcome: job?.outcome ?? attempt?.outcome ?? null,
      durationSeconds:
        attempt?.startedAt
          ? Math.max(
              0,
              Math.floor(
                ((attempt.endedAt?.getTime() ?? Date.now()) -
                  attempt.startedAt.getTime()) /
                  1_000,
              ),
            )
          : 0,
      transcript,
    },
    visitCompleted: workflow.stage === "COMPLETED",
  };
}

async function reconcileAcceptedCall(
  db: AppDatabase,
  run: {
    workspaceId: string;
    appointmentId: string;
    candidateId: string;
    callJobId: string | null;
  },
): Promise<void> {
  if (!run.callJobId) return;
  const [workflow, job] = await Promise.all([
    db
      .select()
      .from(openchairWorkflows)
      .where(
        and(
          eq(openchairWorkflows.workspaceId, run.workspaceId),
          eq(openchairWorkflows.appointmentId, run.appointmentId),
        ),
      )
      .limit(1)
      .then((rows) => rows[0]),
    db
      .select({ outcome: callJobs.outcome })
      .from(callJobs)
      .where(
        and(
          eq(callJobs.workspaceId, run.workspaceId),
          eq(callJobs.id, run.callJobId!),
        ),
      )
      .limit(1)
      .then((rows) => rows[0]),
  ]);
  if (
    !workflow ||
    workflow.stage !== "CALLING_PATIENTS" ||
    job?.outcome !== "confirmed"
  ) {
    return;
  }
  const now = new Date();
  await commitWorkflowFact(db, {
    workspaceId: run.workspaceId,
    appointmentId: run.appointmentId,
    expectedVersion: workflow.version,
    actor: { type: "service", id: "demo_vapi" },
    envelope: {
      eventId: createId("evt"),
      correlationId: createId("corr"),
      occurredAt: now.toISOString(),
      fact: {
        type: "outreach.patient_accepted",
        candidateId: run.candidateId,
      },
    },
    extraOperations: [
      db
        .update(openchairCandidates)
        .set({ status: "ACCEPTED", updatedAt: now })
        .where(
          and(
            eq(openchairCandidates.workspaceId, run.workspaceId),
            eq(openchairCandidates.id, run.candidateId),
          ),
        ),
    ],
  });
}

async function readTranscript(db: AppDatabase, attemptId: string) {
  const encryptionKey = getCallDataEncryptionKey(
    getCallRuntimeEnvironment(),
  );
  const lines = await listCallTranscriptLines(db, [attemptId]);
  return (
    await Promise.all(
      lines.map(async (line) => ({
        speaker: line.speaker,
        text: await revealCallTranscriptText(
          line.textCiphertext,
          encryptionKey,
        ),
      })),
    )
  ).filter(
    (line): line is { speaker: "agent" | "recipient"; text: string } =>
      Boolean(line.text),
  );
}

function presentStage(
  stage: typeof openchairWorkflows.$inferSelect.stage,
): DemoWorkflowStage {
  if (stage === "OPEN_SLOT") return "open-slot";
  if (stage === "PATIENT_SELECTION") return "patients-selected";
  if (stage === "FUNDING_APPROVAL") return "funding";
  if (stage === "CALLING_PATIENTS") return "calling";
  if (stage === "PATIENT_ACCEPTED") return "accepted";
  if (stage === "PAYMENT") return "payment";
  return "filled";
}

function presentPaymentStatus(
  status: typeof openchairPayments.$inferSelect.status | undefined,
): "not_started" | "pending" | "paid" | "failed" | "refunded" {
  if (status === "PAID") return "paid";
  if (status === "FAILED" || status === "EXPIRED") return "failed";
  if (status === "REFUNDED") return "refunded";
  if (status === "PENDING" || status === "CHECKOUT_CREATED") return "pending";
  return "not_started";
}
