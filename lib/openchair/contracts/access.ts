import type { OpenChairAction } from "./permissions.ts";

export const FRONTEND_DATA_GRANTS = [
  "appointment.summary",
  "workflow.journey",
  "beneficiary.list",
  "candidate.order",
  "candidate.outcomes",
  "funding.summary",
  "outreach.status",
  "outreach.transcript",
  "accepted-patient.identity",
  "accepted-patient.contact",
  "payment.status",
  "workflow.failure-detail",
] as const;

export type FrontendDataGrant = (typeof FRONTEND_DATA_GRANTS)[number];

export type AccessDenialReason =
  | "not_granted"
  | "stage_not_active"
  | "disclosure_not_reached";

export type AccessDecision = {
  allowed: boolean;
  reason: AccessDenialReason | null;
};

export type WorkflowFrontendAccess = {
  data: Record<FrontendDataGrant, AccessDecision>;
  actions: Record<OpenChairAction, AccessDecision>;
};

