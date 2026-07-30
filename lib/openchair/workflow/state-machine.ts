import { isTerminalStage } from "../contracts/index.ts";
import type {
  FactEnvelope,
  WorkflowEffect,
  WorkflowFact,
  WorkflowState,
  WorkflowTerminalReason,
  WorkflowTransition,
} from "./types.ts";

export class WorkflowTransitionError extends Error {
  readonly code:
    | "stale_workflow_version"
    | "invalid_workflow_transition"
    | "patient_already_reserved";

  constructor(
    code: WorkflowTransitionError["code"],
    message: string,
  ) {
    super(message);
    this.name = "WorkflowTransitionError";
    this.code = code;
  }
}

export function createInitialWorkflowState(input: {
  appointmentId: string;
  workspaceId: string;
  now: string;
}): WorkflowState {
  return {
    appointmentId: input.appointmentId,
    workspaceId: input.workspaceId,
    stage: "OPEN_SLOT",
    version: 1,
    sponsorPaid: false,
    patientPaid: false,
    reservedCandidateId: null,
    terminalReason: null,
    updatedAt: input.now,
  };
}

export function assertExpectedWorkflowVersion(
  state: WorkflowState,
  expectedVersion: number,
): void {
  if (state.version !== expectedVersion) {
    throw new WorkflowTransitionError(
      "stale_workflow_version",
      `Expected workflow version ${expectedVersion}, received ${state.version}.`,
    );
  }
}

export function applyWorkflowFact(
  state: WorkflowState,
  envelope: FactEnvelope,
): WorkflowTransition {
  const previousState = { ...state };
  const effects: WorkflowEffect[] = [];
  let next = { ...state };

  if (isTerminalStage(state.stage)) {
    if (isDuplicateTerminalFact(state, envelope.fact)) {
      return unchanged(previousState);
    }
    throw invalid(state, envelope.fact);
  }

  switch (envelope.fact.type) {
    case "appointment.published":
      if (state.stage !== "OPEN_SLOT") {
        if (hasPassed(state.stage, "OPEN_SLOT")) return unchanged(previousState);
        throw invalid(state, envelope.fact);
      }
      next = move(next, "PATIENT_SELECTION", envelope.fact, effects);
      break;

    case "candidates.approved":
      if (state.stage !== "PATIENT_SELECTION") {
        if (hasPassed(state.stage, "PATIENT_SELECTION")) {
          return unchanged(previousState);
        }
        throw invalid(state, envelope.fact);
      }
      next = move(next, "FUNDING_APPROVAL", envelope.fact, effects);
      break;

    case "funding.sponsor_paid":
      if (state.sponsorPaid) return unchanged(previousState);
      if (state.stage !== "FUNDING_APPROVAL") {
        throw invalid(state, envelope.fact);
      }
      next.sponsorPaid = true;
      next = move(next, "CALLING_PATIENTS", envelope.fact, effects);
      effects.push({ type: "workflow.outreach_requested" });
      break;

    case "workflow.outreach_started":
      if (state.stage !== "CALLING_PATIENTS") {
        throw invalid(state, envelope.fact);
      }
      return unchanged(previousState);

    case "outreach.patient_accepted": {
      if (
        state.reservedCandidateId === envelope.fact.candidateId &&
        hasPassedOrAt(state.stage, "PATIENT_ACCEPTED")
      ) {
        return unchanged(previousState);
      }
      if (
        state.reservedCandidateId &&
        state.reservedCandidateId !== envelope.fact.candidateId
      ) {
        throw new WorkflowTransitionError(
          "patient_already_reserved",
          "A different patient is already reserved for this appointment.",
        );
      }
      if (state.stage !== "CALLING_PATIENTS") {
        throw invalid(state, envelope.fact);
      }
      next.reservedCandidateId = envelope.fact.candidateId;
      next = move(next, "PATIENT_ACCEPTED", envelope.fact, effects);
      effects.unshift({
        type: "workflow.patient_reserved",
        candidateId: envelope.fact.candidateId,
      });
      break;
    }

    case "funding.patient_checkout_created":
      if (state.stage !== "PATIENT_ACCEPTED" || !state.reservedCandidateId) {
        if (state.stage === "PAYMENT" || state.stage === "CHAIR_FILLED") {
          return unchanged(previousState);
        }
        throw invalid(state, envelope.fact);
      }
      next = move(next, "PAYMENT", envelope.fact, effects);
      break;

    case "funding.patient_paid":
      if (state.patientPaid) return unchanged(previousState);
      if (
        state.stage !== "PAYMENT" ||
        !state.sponsorPaid ||
        !state.reservedCandidateId
      ) {
        throw invalid(state, envelope.fact);
      }
      next.patientPaid = true;
      next = move(next, "CHAIR_FILLED", envelope.fact, effects);
      effects.push({ type: "workflow.chair_filled" });
      break;

    case "funding.payment_failed":
      if (state.stage !== "PAYMENT") throw invalid(state, envelope.fact);
      return unchanged(previousState);

    case "workflow.visit_completed":
      if (state.stage !== "CHAIR_FILLED") throw invalid(state, envelope.fact);
      next = move(next, "COMPLETED", envelope.fact, effects);
      effects.push({ type: "workflow.completed" });
      break;

    case "outreach.exhausted":
      if (state.stage !== "CALLING_PATIENTS") throw invalid(state, envelope.fact);
      next = terminate(
        next,
        "EXPIRED",
        "candidate_pool_exhausted",
        envelope.fact,
        effects,
      );
      break;

    case "appointment.canceled":
      next = terminate(
        next,
        "CANCELED",
        "appointment_canceled",
        envelope.fact,
        effects,
      );
      break;

    case "appointment.expired":
      next = terminate(
        next,
        "EXPIRED",
        "appointment_expired",
        envelope.fact,
        effects,
      );
      break;

    case "workflow.failed":
      next = terminate(
        next,
        "FAILED",
        "workflow_failed",
        envelope.fact,
        effects,
      );
      break;
  }

  const changed = !sameState(previousState, next);
  if (!changed) return unchanged(previousState);
  next.version = previousState.version + 1;
  next.updatedAt = envelope.occurredAt;
  return { previousState, state: next, changed: true, effects };
}

const HAPPY_PATH = [
  "OPEN_SLOT",
  "PATIENT_SELECTION",
  "FUNDING_APPROVAL",
  "CALLING_PATIENTS",
  "PATIENT_ACCEPTED",
  "PAYMENT",
  "CHAIR_FILLED",
  "COMPLETED",
] as const;

function move(
  state: WorkflowState,
  toStage: WorkflowState["stage"],
  fact: WorkflowFact,
  effects: WorkflowEffect[],
): WorkflowState {
  effects.push({
    type: "workflow.stage_changed",
    fromStage: state.stage,
    toStage,
    reason: fact.type,
  });
  return { ...state, stage: toStage };
}

function terminate(
  state: WorkflowState,
  stage: "EXPIRED" | "CANCELED" | "FAILED",
  reason: WorkflowTerminalReason,
  fact: WorkflowFact,
  effects: WorkflowEffect[],
): WorkflowState {
  const next = move(state, stage, fact, effects);
  if (stage === "FAILED") effects.push({ type: "workflow.failed", reason });
  return { ...next, terminalReason: reason };
}

function hasPassed(
  current: WorkflowState["stage"],
  stage: (typeof HAPPY_PATH)[number],
): boolean {
  return HAPPY_PATH.indexOf(current as (typeof HAPPY_PATH)[number]) >
    HAPPY_PATH.indexOf(stage);
}

function hasPassedOrAt(
  current: WorkflowState["stage"],
  stage: (typeof HAPPY_PATH)[number],
): boolean {
  return HAPPY_PATH.indexOf(current as (typeof HAPPY_PATH)[number]) >=
    HAPPY_PATH.indexOf(stage);
}

function isDuplicateTerminalFact(
  state: WorkflowState,
  fact: WorkflowFact,
): boolean {
  return (
    (state.stage === "CANCELED" && fact.type === "appointment.canceled") ||
    (state.stage === "EXPIRED" &&
      ["appointment.expired", "outreach.exhausted"].includes(fact.type)) ||
    (state.stage === "FAILED" && fact.type === "workflow.failed") ||
    (state.stage === "COMPLETED" && fact.type === "workflow.visit_completed")
  );
}

function invalid(
  state: WorkflowState,
  fact: WorkflowFact,
): WorkflowTransitionError {
  return new WorkflowTransitionError(
    "invalid_workflow_transition",
    `${fact.type} is not valid while the workflow is ${state.stage}.`,
  );
}

function unchanged(state: WorkflowState): WorkflowTransition {
  return {
    previousState: state,
    state,
    changed: false,
    effects: [],
  };
}

function sameState(left: WorkflowState, right: WorkflowState): boolean {
  return (
    left.stage === right.stage &&
    left.sponsorPaid === right.sponsorPaid &&
    left.patientPaid === right.patientPaid &&
    left.reservedCandidateId === right.reservedCandidateId &&
    left.terminalReason === right.terminalReason
  );
}
