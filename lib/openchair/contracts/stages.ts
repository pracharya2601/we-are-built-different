export const WORKFLOW_STAGES = [
  "OPEN_SLOT",
  "PATIENT_SELECTION",
  "FUNDING_APPROVAL",
  "CALLING_PATIENTS",
  "PATIENT_ACCEPTED",
  "PAYMENT",
  "CHAIR_FILLED",
  "COMPLETED",
  "EXPIRED",
  "CANCELED",
  "FAILED",
] as const;

export type WorkflowStage = (typeof WORKFLOW_STAGES)[number];

export const JOURNEY_STAGES = [
  "OPEN_SLOT",
  "PATIENT_SELECTION",
  "FUNDING_APPROVAL",
  "CALLING_PATIENTS",
  "PATIENT_ACCEPTED",
  "PAYMENT",
  "CHAIR_FILLED",
] as const;

export type JourneyStage = (typeof JOURNEY_STAGES)[number];

export const TERMINAL_WORKFLOW_STAGES = [
  "COMPLETED",
  "EXPIRED",
  "CANCELED",
  "FAILED",
] as const satisfies readonly WorkflowStage[];

export type StageStatus =
  | "completed"
  | "active"
  | "future"
  | "blocked"
  | "failed";

export const STAGE_LABELS: Record<JourneyStage, string> = {
  OPEN_SLOT: "Open Slot",
  PATIENT_SELECTION: "Patients Selected",
  FUNDING_APPROVAL: "Funding Approval",
  CALLING_PATIENTS: "Calling Patients",
  PATIENT_ACCEPTED: "Patient Accepted",
  PAYMENT: "Payment",
  CHAIR_FILLED: "Chair Filled",
};

export function isTerminalStage(stage: WorkflowStage): boolean {
  return TERMINAL_WORKFLOW_STAGES.includes(
    stage as (typeof TERMINAL_WORKFLOW_STAGES)[number],
  );
}
