import type {
  AppointmentId,
  CorrelationId,
  EventId,
  WorkspaceId,
} from "./identifiers.ts";
import type { CommandActor } from "./commands.ts";
import type { WorkflowStage } from "./stages.ts";

export const OPENCHAIR_EVENT_TYPES = [
  "appointment.published",
  "appointment.canceled",
  "appointment.expired",
  "candidates.approved",
  "funding.approved",
  "funding.sponsor_paid",
  "funding.patient_checkout_created",
  "funding.patient_paid",
  "funding.payment_failed",
  "funding.refunded",
  "workflow.outreach_requested",
  "workflow.patient_reserved",
  "workflow.stage_changed",
  "workflow.chair_filled",
  "workflow.completed",
  "workflow.failed",
  "outreach.started",
  "outreach.call_no_answer",
  "outreach.patient_declined",
  "outreach.patient_accepted",
  "outreach.exhausted",
  "outreach.stopped",
] as const;

export type OpenChairEventType = (typeof OPENCHAIR_EVENT_TYPES)[number];

export interface DomainEvent<T> {
  eventId: EventId;
  eventType: OpenChairEventType;
  eventVersion: 1;
  aggregateType: "appointment";
  aggregateId: AppointmentId;
  aggregateVersion: number;
  workspaceId: WorkspaceId;
  correlationId: CorrelationId;
  causationId?: string;
  producer: string;
  actor?: CommandActor;
  occurredAt: string;
  data: T;
}

export type WorkflowStageChangedData = {
  fromStage: WorkflowStage;
  toStage: WorkflowStage;
  reason: string;
};
