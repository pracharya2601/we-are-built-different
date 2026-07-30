import type {
  CommandActor,
  OpenChairEventType,
  WorkflowStage,
} from "../contracts/index.ts";
import { applyWorkflowFact } from "./state-machine.ts";
import type {
  FactEnvelope,
  WorkflowEffect,
  WorkflowState,
  WorkflowTransition,
} from "./types.ts";

/**
 * Rows a committed workflow fact must write. Building them is deliberately
 * separated from writing them: the decision is pure and unit-testable, and the
 * repository only has to execute the plan atomically.
 */
export type WorkflowCommitPlan = {
  transition: WorkflowTransition;
  /** Version the stored row must still hold for the commit to be valid. */
  expectedVersion: number;
  workflow: {
    stage: WorkflowStage;
    version: number;
    sponsorPaid: boolean;
    patientPaid: boolean;
    reservedCandidateId: string | null;
    terminalReason: WorkflowState["terminalReason"];
    updatedAt: Date;
  };
  history: {
    id: string;
    workspaceId: string;
    appointmentId: string;
    workflowVersion: number;
    fromStage: WorkflowStage;
    toStage: WorkflowStage;
    eventId: string;
    eventType: string;
    correlationId: string;
    actorType: CommandActor["type"];
    actorId: string | null;
    occurredAt: Date;
  };
  outbox: WorkflowOutboxEvent[];
};

export type WorkflowOutboxEvent = {
  id: string;
  aggregateType: "appointment";
  aggregateId: string;
  eventType: OpenChairEventType;
  schemaVersion: 1;
  payload: Record<string, unknown>;
  availableAt: Date;
};

export type WorkflowCommitPlanResult =
  | { changed: false; transition: WorkflowTransition }
  | ({ changed: true } & WorkflowCommitPlan);

export type PlanWorkflowCommitInput = {
  state: WorkflowState;
  envelope: FactEnvelope;
  actor: CommandActor;
  /** Injected so tests can assert on stable identifiers. */
  newId: (prefix: string) => string;
};

/**
 * Applies one fact and returns the rows it implies. A fact that leaves the
 * workflow unchanged — a duplicate provider event, a replayed command — plans
 * no writes at all, so duplicates never consume a version or emit an event.
 */
export function planWorkflowCommit(
  input: PlanWorkflowCommitInput,
): WorkflowCommitPlanResult {
  const transition = applyWorkflowFact(input.state, input.envelope);
  if (!transition.changed) return { changed: false, transition };

  const { previousState, state } = transition;
  const occurredAt = new Date(input.envelope.occurredAt);
  const stageChange = transition.effects.find(
    (effect): effect is Extract<
      WorkflowEffect,
      { type: "workflow.stage_changed" }
    > => effect.type === "workflow.stage_changed",
  );

  return {
    changed: true,
    transition,
    expectedVersion: previousState.version,
    workflow: {
      stage: state.stage,
      version: state.version,
      sponsorPaid: state.sponsorPaid,
      patientPaid: state.patientPaid,
      reservedCandidateId: state.reservedCandidateId,
      terminalReason: state.terminalReason,
      updatedAt: occurredAt,
    },
    history: {
      id: input.newId("wfh"),
      workspaceId: state.workspaceId,
      appointmentId: state.appointmentId,
      workflowVersion: state.version,
      fromStage: stageChange?.fromStage ?? previousState.stage,
      toStage: stageChange?.toStage ?? state.stage,
      eventId: input.envelope.eventId,
      eventType: input.envelope.fact.type,
      correlationId: input.envelope.correlationId,
      actorType: input.actor.type,
      actorId: input.actor.id || null,
      occurredAt,
    },
    outbox: transition.effects.map((effect) => ({
      id: input.newId("evt"),
      aggregateType: "appointment" as const,
      aggregateId: state.appointmentId,
      eventType: effect.type,
      schemaVersion: 1 as const,
      payload: {
        ...effectPayload(effect),
        workspaceId: state.workspaceId,
        appointmentId: state.appointmentId,
        aggregateVersion: state.version,
        correlationId: input.envelope.correlationId,
        causationId: input.envelope.eventId,
        actor: { type: input.actor.type, id: input.actor.id },
        occurredAt: input.envelope.occurredAt,
      },
      availableAt: occurredAt,
    })),
  };
}

function effectPayload(effect: WorkflowEffect): Record<string, unknown> {
  switch (effect.type) {
    case "workflow.stage_changed":
      return {
        fromStage: effect.fromStage,
        toStage: effect.toStage,
        reason: effect.reason,
      };
    case "workflow.patient_reserved":
      return { candidateId: effect.candidateId };
    case "workflow.failed":
      return { reason: effect.reason };
    default:
      return {};
  }
}
