import { and, eq } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import type { AppDatabase } from "../../../db";
import {
  openchairWorkflowHistory,
  openchairWorkflows,
  outboxEvents,
} from "../../../db/schema.ts";
import { createId } from "../../data/ids.ts";
import type { CommandActor } from "../contracts/index.ts";
import { OpenChairError } from "../shared/errors.ts";
import { planWorkflowCommit } from "./commit-plan.ts";
import type { WorkflowCommitPlanResult } from "./commit-plan.ts";
import { assertExpectedWorkflowVersion } from "./state-machine.ts";
import type {
  FactEnvelope,
  WorkflowEffect,
  WorkflowState,
} from "./types.ts";

export type CommitWorkflowFactInput = {
  workspaceId: string;
  appointmentId: string;
  envelope: FactEnvelope;
  actor: CommandActor;
  /**
   * When supplied, the commit fails with `stale_workflow_version` unless the
   * stored workflow is still at this version. Provider events omit it because
   * they carry their own idempotency; user commands should always send it.
   */
  expectedVersion?: number;
  /**
   * Module-owned writes committed in the same batch as the workflow change,
   * so a payment row and the stage it causes can never disagree.
   */
  extraOperations?: BatchItem<"sqlite">[];
  newId?: (prefix: string) => string;
};

export type CommitWorkflowFactResult = {
  changed: boolean;
  state: WorkflowState;
  effects: WorkflowEffect[];
};

export async function loadWorkflowState(
  db: AppDatabase,
  workspaceId: string,
  appointmentId: string,
): Promise<WorkflowState | null> {
  const row = (
    await db
      .select()
      .from(openchairWorkflows)
      .where(
        and(
          eq(openchairWorkflows.appointmentId, appointmentId),
          eq(openchairWorkflows.workspaceId, workspaceId),
        ),
      )
      .limit(1)
  )[0];
  return row ? toWorkflowState(row) : null;
}

export function toWorkflowState(row: {
  appointmentId: string;
  workspaceId: string;
  stage: WorkflowState["stage"];
  version: number;
  sponsorPaid: boolean;
  patientPaid: boolean;
  reservedCandidateId: string | null;
  terminalReason: WorkflowState["terminalReason"];
  updatedAt: Date;
}): WorkflowState {
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

/**
 * The single write path for OpenChair workflow state.
 *
 * Loads the current state, applies one fact through the state machine, and
 * commits the new state, its history row, and one outbox event per effect in
 * a single batch. Two guards make concurrent writers safe: the UPDATE only
 * matches the version the decision was made against, and the
 * `(appointment_id, workflow_version)` unique index rejects a second row for
 * the same version, aborting the whole batch.
 *
 * A fact that changes nothing writes no workflow rows and consumes no version.
 */
export async function commitWorkflowFact(
  db: AppDatabase,
  input: CommitWorkflowFactInput,
): Promise<CommitWorkflowFactResult> {
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
  if (input.expectedVersion !== undefined) {
    assertExpectedWorkflowVersion(state, input.expectedVersion);
  }

  const extras = input.extraOperations ?? [];
  const plan = planWorkflowCommit({
    state,
    envelope: input.envelope,
    actor: input.actor,
    newId: input.newId ?? createId,
  });

  if (!plan.changed) {
    if (extras.length > 0) await runBatch(db, extras);
    return { changed: false, state, effects: [] };
  }

  await runBatch(db, [
    ...buildWorkflowCommitOperations(db, {
      workspaceId: input.workspaceId,
      appointmentId: input.appointmentId,
      plan,
    }),
    ...extras,
  ]);

  return {
    changed: true,
    state: plan.transition.state,
    effects: plan.transition.effects,
  };
}

/**
 * Turns a commit plan into statements. Callers that already own a batch — the
 * funding webhook, for one — use this directly so their rows and the workflow
 * change stay in a single transaction. Every effect becomes an outbox event
 * here, which is what lets outreach observe `workflow.outreach_requested`.
 */
export function buildWorkflowCommitOperations(
  db: AppDatabase,
  input: {
    workspaceId: string;
    appointmentId: string;
    plan: Extract<WorkflowCommitPlanResult, { changed: true }>;
  },
): BatchItem<"sqlite">[] {
  const { plan } = input;
  return [
    db
      .update(openchairWorkflows)
      .set({
        stage: plan.workflow.stage,
        version: plan.workflow.version,
        sponsorPaid: plan.workflow.sponsorPaid,
        patientPaid: plan.workflow.patientPaid,
        reservedCandidateId: plan.workflow.reservedCandidateId,
        terminalReason: plan.workflow.terminalReason,
        updatedAt: plan.workflow.updatedAt,
      })
      .where(
        and(
          eq(openchairWorkflows.appointmentId, input.appointmentId),
          eq(openchairWorkflows.workspaceId, input.workspaceId),
          eq(openchairWorkflows.version, plan.expectedVersion),
        ),
      ),
    db.insert(openchairWorkflowHistory).values({
      ...plan.history,
      createdAt: plan.history.occurredAt,
    }),
    ...plan.outbox.map((event) =>
      db.insert(outboxEvents).values({
        id: event.id,
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        eventType: event.eventType,
        schemaVersion: event.schemaVersion,
        payload: event.payload,
        availableAt: event.availableAt,
        createdAt: event.availableAt,
        updatedAt: event.availableAt,
      }),
    ),
  ];
}

function runBatch(db: AppDatabase, operations: BatchItem<"sqlite">[]) {
  return db.batch(
    operations as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]],
  );
}
