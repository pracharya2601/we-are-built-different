import type {
  AppointmentId,
  CandidateId,
  CorrelationId,
  EventId,
  WorkflowStage,
  WorkspaceId,
} from "../contracts/index.ts";

export type WorkflowTerminalReason =
  | "appointment_canceled"
  | "appointment_expired"
  | "candidate_pool_exhausted"
  | "workflow_failed";

export type WorkflowState = {
  appointmentId: AppointmentId;
  workspaceId: WorkspaceId;
  stage: WorkflowStage;
  version: number;
  sponsorPaid: boolean;
  patientPaid: boolean;
  reservedCandidateId: CandidateId | null;
  terminalReason: WorkflowTerminalReason | null;
  updatedAt: string;
};

export type WorkflowFact =
  | { type: "appointment.published" }
  | { type: "candidates.approved" }
  | { type: "funding.sponsor_paid" }
  | { type: "workflow.outreach_started" }
  | {
      type: "outreach.patient_accepted";
      candidateId: CandidateId;
    }
  | { type: "funding.patient_checkout_created" }
  | { type: "funding.patient_paid" }
  | { type: "funding.payment_failed" }
  | { type: "outreach.exhausted" }
  | { type: "appointment.canceled" }
  | { type: "appointment.expired" }
  | { type: "workflow.visit_completed" }
  | { type: "workflow.failed" };

export type FactEnvelope = {
  eventId: EventId;
  correlationId: CorrelationId;
  occurredAt: string;
  fact: WorkflowFact;
};

export type WorkflowEffect =
  | {
      type: "workflow.stage_changed";
      fromStage: WorkflowStage;
      toStage: WorkflowStage;
      reason: WorkflowFact["type"];
    }
  | { type: "workflow.outreach_requested" }
  | {
      type: "workflow.patient_reserved";
      candidateId: CandidateId;
    }
  | { type: "workflow.chair_filled" }
  | { type: "workflow.completed" }
  | { type: "workflow.failed"; reason: WorkflowTerminalReason };

export type WorkflowTransition = {
  previousState: WorkflowState;
  state: WorkflowState;
  changed: boolean;
  effects: WorkflowEffect[];
};
