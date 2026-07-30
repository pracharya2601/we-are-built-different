import { and, eq, inArray, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import type { AppDatabase } from "../../../db";
import {
  openchairAppointments,
  openchairCandidates,
  openchairCommandReceipts,
  openchairWorkflowHistory,
  openchairWorkflows,
  outboxEvents,
} from "../../../db/schema";
import { createId } from "../../data/ids";
import {
  applyWorkflowFact,
  assertExpectedWorkflowVersion,
  WorkflowTransitionError,
} from "../workflow";
import type { WorkflowFact, WorkflowState } from "../workflow";
import { OpenChairCommandError } from "./errors";

const IDEMPOTENCY_KEY = /^[A-Za-z0-9_:.+-]{8,128}$/u;

export type AppointmentCommandInput = {
  workspaceId: string;
  userId: string;
  appointmentId: string;
  expectedWorkflowVersion: number;
  idempotencyKey: string;
};

export type ApproveCandidatesInput = AppointmentCommandInput & {
  candidateIds: string[];
};

export type AppointmentCommandResult = {
  appointmentId: string;
  workflowVersion: number;
  stage: WorkflowState["stage"];
  duplicate: boolean;
};

export async function publishAppointment(
  db: AppDatabase,
  input: AppointmentCommandInput,
): Promise<AppointmentCommandResult> {
  validateBaseInput(input);
  return executeCommand(db, {
    ...input,
    commandType: "appointment.publish",
    fact: { type: "appointment.published" },
    requestData: {},
    prepare: async (workflow, now) => {
      const appointment = (
        await db
          .select({
            id: openchairAppointments.id,
            status: openchairAppointments.status,
          })
          .from(openchairAppointments)
          .where(
            and(
              eq(openchairAppointments.id, input.appointmentId),
              eq(openchairAppointments.workspaceId, input.workspaceId),
            ),
          )
          .limit(1)
      )[0];
      if (!appointment) {
        throw new OpenChairCommandError(
          "appointment_not_found",
          "Appointment was not found.",
          404,
        );
      }
      if (appointment.status !== "draft") {
        throw new OpenChairCommandError(
          "appointment_not_publishable",
          "Only a draft appointment can be published.",
          409,
        );
      }
      return [
        db
          .update(openchairAppointments)
          .set({
            status: "published",
            version: sql`${openchairAppointments.version} + 1`,
            updatedAt: now,
          })
          .where(
            and(
              eq(openchairAppointments.id, input.appointmentId),
              eq(openchairAppointments.workspaceId, input.workspaceId),
              eq(openchairAppointments.status, "draft"),
            ),
          ),
      ];
    },
  });
}

export async function approveOrderedCandidates(
  db: AppDatabase,
  input: ApproveCandidatesInput,
): Promise<AppointmentCommandResult> {
  validateBaseInput(input);
  validateCandidateIds(input.candidateIds);
  return executeCommand(db, {
    ...input,
    commandType: "candidates.approve",
    fact: { type: "candidates.approved" },
    requestData: { candidateIds: input.candidateIds },
    prepare: async (_workflow, now) => {
      const candidates = await db
        .select({
          id: openchairCandidates.id,
          status: openchairCandidates.status,
          sequenceNumber: openchairCandidates.sequenceNumber,
        })
        .from(openchairCandidates)
        .where(
          and(
            eq(openchairCandidates.workspaceId, input.workspaceId),
            eq(openchairCandidates.appointmentId, input.appointmentId),
          ),
        );
      const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
      if (
        candidates.length !== input.candidateIds.length ||
        input.candidateIds.some((candidateId) => !byId.has(candidateId))
      ) {
        throw new OpenChairCommandError(
          "candidate_selection_mismatch",
          "Candidate IDs must contain the complete appointment candidate list.",
          409,
        );
      }
      if (
        input.candidateIds.some(
          (candidateId) => byId.get(candidateId)?.status !== "SELECTED",
        )
      ) {
        throw new OpenChairCommandError(
          "candidates_not_approvable",
          "All candidates must be selected before approval.",
          409,
        );
      }
      const storedOrder = [...candidates]
        .sort((left, right) => left.sequenceNumber - right.sequenceNumber)
        .map((candidate) => candidate.id);
      if (
        storedOrder.some(
          (candidateId, index) => input.candidateIds[index] !== candidateId,
        )
      ) {
        throw new OpenChairCommandError(
          "candidate_order_mismatch",
          "Candidate IDs must follow the stored appointment order.",
          409,
        );
      }
      return [
        db
          .update(openchairCandidates)
          .set({
            status: "QUEUED",
            approvedAt: now,
            updatedAt: now,
          })
          .where(
            and(
              eq(openchairCandidates.workspaceId, input.workspaceId),
              eq(openchairCandidates.appointmentId, input.appointmentId),
              inArray(openchairCandidates.id, input.candidateIds),
              eq(openchairCandidates.status, "SELECTED"),
            ),
          ),
      ];
    },
  });
}

type ExecuteInput = AppointmentCommandInput & {
  commandType: "appointment.publish" | "candidates.approve";
  fact: WorkflowFact;
  requestData: Record<string, unknown>;
  prepare: (
    workflow: WorkflowState,
    now: Date,
  ) => Promise<BatchItem<"sqlite">[]>;
};

async function executeCommand(
  db: AppDatabase,
  input: ExecuteInput,
): Promise<AppointmentCommandResult> {
  const requestHash = await hashRequest({
    commandType: input.commandType,
    expectedWorkflowVersion: input.expectedWorkflowVersion,
    ...input.requestData,
  });
  const now = new Date();
  const correlationId = createId("corr");
  const [claimed] = await db
    .insert(openchairCommandReceipts)
    .values({
      id: createId("cmd"),
      workspaceId: input.workspaceId,
      aggregateType: "appointment",
      aggregateId: input.appointmentId,
      commandType: input.commandType,
      idempotencyKey: input.idempotencyKey,
      requestHash,
      expectedVersion: input.expectedWorkflowVersion,
      status: "processing",
      correlationId,
      actorType: "user",
      actorId: input.userId,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing()
    .returning({ id: openchairCommandReceipts.id });

  if (!claimed) {
    return resolveDuplicate(db, input, requestHash);
  }

  try {
    const workflowRow = await loadWorkflow(
      db,
      input.workspaceId,
      input.appointmentId,
    );
    if (!workflowRow) {
      throw new OpenChairCommandError(
        "appointment_not_found",
        "Appointment workflow was not found.",
        404,
      );
    }
    const workflow = toWorkflowState(workflowRow);
    assertExpectedWorkflowVersion(
      workflow,
      input.expectedWorkflowVersion,
    );
    const eventId = createId("evt");
    const transition = applyWorkflowFact(workflow, {
      eventId,
      correlationId,
      occurredAt: now.toISOString(),
      fact: input.fact,
    });
    if (!transition.changed) {
      throw new OpenChairCommandError(
        "command_already_applied",
        "The workflow has already passed this command.",
        409,
      );
    }
    const prepared = await input.prepare(workflow, now);
    const operations: BatchItem<"sqlite">[] = [
      ...prepared,
      db
        .update(openchairWorkflows)
        .set({
          stage: transition.state.stage,
          version: transition.state.version,
          sponsorPaid: transition.state.sponsorPaid,
          patientPaid: transition.state.patientPaid,
          reservedCandidateId: transition.state.reservedCandidateId,
          terminalReason: transition.state.terminalReason,
          updatedAt: now,
        })
        .where(
          and(
            eq(openchairWorkflows.workspaceId, input.workspaceId),
            eq(openchairWorkflows.appointmentId, input.appointmentId),
            eq(openchairWorkflows.version, input.expectedWorkflowVersion),
          ),
        ),
      db.insert(openchairWorkflowHistory).values({
        id: createId("hist"),
        workspaceId: input.workspaceId,
        appointmentId: input.appointmentId,
        workflowVersion: transition.state.version,
        fromStage: transition.previousState.stage,
        toStage: transition.state.stage,
        eventId,
        eventType: input.fact.type,
        correlationId,
        actorType: "user",
        actorId: input.userId,
        occurredAt: now,
        createdAt: now,
      }),
      db.insert(outboxEvents).values({
        id: eventId,
        aggregateType: "appointment",
        aggregateId: input.appointmentId,
        eventType: input.fact.type,
        schemaVersion: 1,
        payload: {
          workspaceId: input.workspaceId,
          appointmentId: input.appointmentId,
          workflowVersion: transition.state.version,
          actorUserId: input.userId,
          ...input.requestData,
        },
        availableAt: now,
        createdAt: now,
        updatedAt: now,
      }),
      db
        .update(openchairCommandReceipts)
        .set({
          status: "completed",
          resultVersion: transition.state.version,
          completedAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(openchairCommandReceipts.id, claimed.id),
            eq(openchairCommandReceipts.workspaceId, input.workspaceId),
            eq(openchairCommandReceipts.status, "processing"),
          ),
        ),
    ];
    await db.batch(
      operations as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]],
    );
    return {
      appointmentId: input.appointmentId,
      workflowVersion: transition.state.version,
      stage: transition.state.stage,
      duplicate: false,
    };
  } catch (error) {
    await markReceiptFailed(db, claimed.id, input.workspaceId);
    if (error instanceof OpenChairCommandError) throw error;
    if (error instanceof WorkflowTransitionError) {
      throw transitionError(error);
    }
    const latest = await loadWorkflow(
      db,
      input.workspaceId,
      input.appointmentId,
    );
    if (
      latest &&
      latest.version !== input.expectedWorkflowVersion
    ) {
      throw staleVersion(input.expectedWorkflowVersion, latest.version);
    }
    throw error;
  }
}

async function resolveDuplicate(
  db: AppDatabase,
  input: ExecuteInput,
  requestHash: string,
): Promise<AppointmentCommandResult> {
  const receipt = (
    await db
      .select()
      .from(openchairCommandReceipts)
      .where(
        and(
          eq(openchairCommandReceipts.workspaceId, input.workspaceId),
          eq(openchairCommandReceipts.aggregateType, "appointment"),
          eq(openchairCommandReceipts.aggregateId, input.appointmentId),
          eq(openchairCommandReceipts.idempotencyKey, input.idempotencyKey),
        ),
      )
      .limit(1)
  )[0];
  if (!receipt || receipt.requestHash !== requestHash) {
    throw new OpenChairCommandError(
      "idempotency_key_conflict",
      "The idempotency key was already used for a different request.",
      409,
    );
  }
  if (receipt.status !== "completed" || receipt.resultVersion === null) {
    throw new OpenChairCommandError(
      receipt.status === "processing"
        ? "command_in_progress"
        : "command_previously_failed",
      receipt.status === "processing"
        ? "The command is already being processed."
        : "The previous command attempt failed.",
      409,
    );
  }
  const workflow = await loadWorkflow(
    db,
    input.workspaceId,
    input.appointmentId,
  );
  if (!workflow) {
    throw new OpenChairCommandError(
      "appointment_not_found",
      "Appointment workflow was not found.",
      404,
    );
  }
  return {
    appointmentId: input.appointmentId,
    workflowVersion: receipt.resultVersion,
    stage: workflow.stage,
    duplicate: true,
  };
}

async function loadWorkflow(
  db: AppDatabase,
  workspaceId: string,
  appointmentId: string,
) {
  return (
    await db
      .select()
      .from(openchairWorkflows)
      .where(
        and(
          eq(openchairWorkflows.workspaceId, workspaceId),
          eq(openchairWorkflows.appointmentId, appointmentId),
        ),
      )
      .limit(1)
  )[0] ?? null;
}

function toWorkflowState(
  row: typeof openchairWorkflows.$inferSelect,
): WorkflowState {
  return {
    appointmentId: row.appointmentId,
    workspaceId: row.workspaceId,
    stage: row.stage,
    version: row.version,
    sponsorPaid: row.sponsorPaid,
    patientPaid: row.patientPaid,
    reservedCandidateId: row.reservedCandidateId,
    terminalReason: row.terminalReason,
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function markReceiptFailed(
  db: AppDatabase,
  receiptId: string,
  workspaceId: string,
): Promise<void> {
  await db
    .update(openchairCommandReceipts)
    .set({ status: "failed", completedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(openchairCommandReceipts.id, receiptId),
        eq(openchairCommandReceipts.workspaceId, workspaceId),
        eq(openchairCommandReceipts.status, "processing"),
      ),
    );
}

function validateBaseInput(input: AppointmentCommandInput): void {
  if (
    !input.workspaceId ||
    !input.userId ||
    !input.appointmentId ||
    !Number.isSafeInteger(input.expectedWorkflowVersion) ||
    input.expectedWorkflowVersion < 1
  ) {
    throw new OpenChairCommandError(
      "invalid_command",
      "A valid appointment and expected workflow version are required.",
    );
  }
  if (!IDEMPOTENCY_KEY.test(input.idempotencyKey)) {
    throw new OpenChairCommandError(
      "invalid_idempotency_key",
      "Idempotency key must be 8 to 128 URL-safe characters.",
    );
  }
}

function validateCandidateIds(candidateIds: string[]): void {
  if (
    !Array.isArray(candidateIds) ||
    candidateIds.length === 0 ||
    candidateIds.length > 100 ||
    candidateIds.some((candidateId) => !candidateId.trim()) ||
    new Set(candidateIds).size !== candidateIds.length
  ) {
    throw new OpenChairCommandError(
      "invalid_candidate_ids",
      "Provide between 1 and 100 unique ordered candidate IDs.",
    );
  }
}

function transitionError(
  error: WorkflowTransitionError,
): OpenChairCommandError {
  if (error.code === "stale_workflow_version") {
    return new OpenChairCommandError(error.code, error.message, 409);
  }
  return new OpenChairCommandError(error.code, error.message, 409);
}

function staleVersion(
  expected: number,
  actual: number,
): OpenChairCommandError {
  return new OpenChairCommandError(
    "stale_workflow_version",
    `Expected workflow version ${expected}, received ${actual}.`,
    409,
  );
}

async function hashRequest(value: Record<string, unknown>): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
