import { and, eq } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import type { AppDatabase } from "../../../db";
import { openchairAppointments } from "../../../db/schema.ts";
import type { CommandActor } from "../contracts/index.ts";
import {
  claimCommandReceipt,
  completeCommandReceipt,
  failCommandReceipt,
  hashCommandRequest,
} from "../shared/command-receipts.ts";
import { OpenChairError } from "../shared/errors.ts";
import { commitWorkflowFact, loadWorkflowState } from "./repository.ts";
import type { WorkflowEffect, WorkflowFact, WorkflowState } from "./types.ts";

export type WorkflowCommandType =
  | "appointment.publish"
  | "appointment.cancel"
  | "appointment.expire"
  | "appointment.complete";

export type WorkflowCommandInput = {
  workspaceId: string;
  appointmentId: string;
  idempotencyKey: string;
  correlationId: string;
  actor: CommandActor;
  /** Omit only for system-driven commands such as scheduled expiry. */
  expectedVersion?: number;
  occurredAt?: string;
};

export type WorkflowCommandResult = {
  replayed: boolean;
  changed: boolean;
  state: WorkflowState;
  effects: WorkflowEffect[];
};

export function publishAppointment(
  db: AppDatabase,
  input: WorkflowCommandInput,
): Promise<WorkflowCommandResult> {
  return executeWorkflowCommand(db, input, {
    commandType: "appointment.publish",
    fact: { type: "appointment.published" },
    appointmentStatus: "published",
  });
}

export function cancelAppointment(
  db: AppDatabase,
  input: WorkflowCommandInput,
): Promise<WorkflowCommandResult> {
  return executeWorkflowCommand(db, input, {
    commandType: "appointment.cancel",
    fact: { type: "appointment.canceled" },
    appointmentStatus: "canceled",
  });
}

/**
 * Scheduled expiry. The appointment row keeps its own status because an
 * expired claim window is a workflow outcome, not a change to the slot the
 * clinic offered.
 */
export function expireAppointment(
  db: AppDatabase,
  input: WorkflowCommandInput,
): Promise<WorkflowCommandResult> {
  return executeWorkflowCommand(db, input, {
    commandType: "appointment.expire",
    fact: { type: "appointment.expired" },
  });
}

export function completeAppointmentVisit(
  db: AppDatabase,
  input: WorkflowCommandInput,
): Promise<WorkflowCommandResult> {
  return executeWorkflowCommand(db, input, {
    commandType: "appointment.complete",
    fact: { type: "workflow.visit_completed" },
    appointmentStatus: "completed",
  });
}

/**
 * Runs one command exactly once.
 *
 * The receipt is claimed before any state changes and completed after they
 * land. A replay returns the stored workflow without reapplying the fact; a
 * still-running attempt is rejected rather than raced.
 */
export async function executeWorkflowCommand(
  db: AppDatabase,
  input: WorkflowCommandInput,
  definition: {
    commandType: WorkflowCommandType;
    fact: WorkflowFact;
    appointmentStatus?: "published" | "canceled" | "completed";
  },
): Promise<WorkflowCommandResult> {
  const occurredAt = input.occurredAt ?? new Date().toISOString();
  const requestHash = await hashCommandRequest({
    commandType: definition.commandType,
    workspaceId: input.workspaceId,
    appointmentId: input.appointmentId,
    fact: definition.fact,
    expectedVersion: input.expectedVersion ?? null,
  });

  const claim = await claimCommandReceipt(db, {
    workspaceId: input.workspaceId,
    appointmentId: input.appointmentId,
    commandType: definition.commandType,
    idempotencyKey: input.idempotencyKey,
    requestHash,
    expectedVersion: input.expectedVersion ?? 1,
    correlationId: input.correlationId,
    actor: input.actor,
  });

  if (claim.status === "in_flight") {
    throw new OpenChairError(
      "command_in_flight",
      "An earlier attempt at this command is still running.",
      409,
    );
  }

  if (claim.status === "replayed") {
    const state = await requireWorkflowState(db, input);
    return { replayed: true, changed: false, state, effects: [] };
  }

  try {
    const result = await commitWorkflowFact(db, {
      workspaceId: input.workspaceId,
      appointmentId: input.appointmentId,
      actor: input.actor,
      expectedVersion: input.expectedVersion,
      envelope: {
        eventId: `evt_${requestHash.slice(0, 32)}`,
        correlationId: input.correlationId,
        occurredAt,
        fact: definition.fact,
      },
      extraOperations: appointmentStatusOperations(db, input, definition),
    });
    await completeCommandReceipt(db, claim.receiptId, result.state.version);
    return {
      replayed: false,
      changed: result.changed,
      state: result.state,
      effects: result.effects,
    };
  } catch (error) {
    await failCommandReceipt(db, claim.receiptId);
    throw error;
  }
}

function appointmentStatusOperations(
  db: AppDatabase,
  input: WorkflowCommandInput,
  definition: { appointmentStatus?: "published" | "canceled" | "completed" },
): BatchItem<"sqlite">[] {
  if (!definition.appointmentStatus) return [];
  return [
    db
      .update(openchairAppointments)
      .set({ status: definition.appointmentStatus, updatedAt: new Date() })
      .where(
        and(
          eq(openchairAppointments.id, input.appointmentId),
          eq(openchairAppointments.workspaceId, input.workspaceId),
        ),
      ),
  ];
}

async function requireWorkflowState(
  db: AppDatabase,
  input: WorkflowCommandInput,
): Promise<WorkflowState> {
  const state = await loadWorkflowState(
    db,
    input.workspaceId,
    input.appointmentId,
  );
  if (!state) {
    throw new OpenChairError(
      "workflow_not_found",
      "No workflow exists for this appointment.",
      404,
    );
  }
  return state;
}
