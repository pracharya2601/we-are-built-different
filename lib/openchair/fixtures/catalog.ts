import chairFilled from "../../../fixtures/openchair/chair-filled.json";
import callingConnected from "../../../fixtures/openchair/calling-connected.json";
import callingNoAnswer from "../../../fixtures/openchair/calling-no-answer.json";
import fundingApproval from "../../../fixtures/openchair/funding-approval.json";
import openSlot from "../../../fixtures/openchair/open-slot.json";
import patientAccepted from "../../../fixtures/openchair/patient-accepted.json";
import patientSelection from "../../../fixtures/openchair/patient-selection.json";
import paymentWaiting from "../../../fixtures/openchair/payment-waiting.json";
import workflowExpired from "../../../fixtures/openchair/workflow-expired.json";
import workflowFailed from "../../../fixtures/openchair/workflow-failed.json";
import {
  JOURNEY_STAGES,
  VIEWER_ROLES,
  WORKFLOW_STAGES,
  type JourneyStage,
  type PaymentPresentation,
  type ViewerRole,
  type WorkflowProjection,
  type WorkflowStage,
} from "../contracts/index.ts";
import {
  allowedActionsFor,
  buildStagePresentations,
} from "../projections/index.ts";

type Scenario = {
  name: string;
  description: string;
  activeStage: WorkflowStage;
  lastJourneyStage: JourneyStage;
  workflowVersion: number;
  selectedCandidateCount: number;
  currentCandidateName?: string;
  acceptedCandidateId?: string;
  acceptedPatientName?: string;
  previousOutcomes?: Array<{ displayName: string; outcome: string }>;
  sponsorStatus: PaymentPresentation["sponsor"]["status"];
  patientStatus: PaymentPresentation["patient"]["status"];
  blockedReason?: string;
};

const FIXTURES = {
  "open-slot": openSlot,
  "patient-selection": patientSelection,
  "funding-approval": fundingApproval,
  "calling-no-answer": callingNoAnswer,
  "calling-connected": callingConnected,
  "patient-accepted": patientAccepted,
  "payment-waiting": paymentWaiting,
  "chair-filled": chairFilled,
  "workflow-failed": workflowFailed,
  "workflow-expired": workflowExpired,
} as const;

export type WorkflowFixtureName = keyof typeof FIXTURES;

export const WORKFLOW_FIXTURE_NAMES = Object.keys(
  FIXTURES,
) as WorkflowFixtureName[];

export function isWorkflowFixtureName(
  value: string,
): value is WorkflowFixtureName {
  return value in FIXTURES;
}

export function isViewerRole(value: string): value is ViewerRole {
  return VIEWER_ROLES.includes(value as ViewerRole);
}

export function buildWorkflowFixture(
  name: WorkflowFixtureName,
  viewerRole: ViewerRole = "operator",
): WorkflowProjection {
  const scenario = parseScenario(FIXTURES[name]);
  const panelType = WORKFLOW_STAGES.includes(scenario.activeStage)
    ? JOURNEY_STAGES.includes(scenario.activeStage as JourneyStage)
      ? (scenario.activeStage as JourneyStage)
      : "TERMINAL"
    : "TERMINAL";

  return {
    appointment: {
      appointmentId: "appt_11111111111111111111111111111111",
      clinicName: "OpenChair Dental Clinic",
      startsAt: "2026-07-30T15:00:00-07:00",
      durationMinutes: 60,
      treatmentType: "General dental visit",
      currency: "USD",
      fullPrice: 12000,
      discountedPrice: 8000,
      sponsorAmount: 6000,
      patientAmount: 2000,
      expiresAt: "2026-07-30T14:15:00-07:00",
    },
    activeStage: scenario.activeStage,
    stages: buildStagePresentations(
      scenario.activeStage,
      scenario.lastJourneyStage,
    ),
    viewerRole,
    panelType,
    panelData: {
      selectedCandidateCount: scenario.selectedCandidateCount,
      currentCandidateName: scenario.currentCandidateName,
      acceptedCandidateId: scenario.acceptedCandidateId,
      acceptedPatientName: scenario.acceptedPatientName,
      previousOutcomes: scenario.previousOutcomes,
      payments: {
        sponsor: { amount: 6000, status: scenario.sponsorStatus },
        patient: { amount: 2000, status: scenario.patientStatus },
      },
      blockedReason: scenario.blockedReason,
    },
    allowedActions: allowedActionsFor(viewerRole, scenario.activeStage),
    workflowVersion: scenario.workflowVersion,
    lastUpdatedAt: "2026-07-30T13:05:00-07:00",
    fixture: {
      name: scenario.name,
      description: scenario.description,
    },
  };
}

function parseScenario(value: unknown): Scenario {
  if (!isRecord(value)) throw new Error("OpenChair fixture must be an object.");
  const activeStage = readEnum(
    value.activeStage,
    WORKFLOW_STAGES,
    "activeStage",
  );
  const lastJourneyStage = readEnum(
    value.lastJourneyStage,
    JOURNEY_STAGES,
    "lastJourneyStage",
  );
  const sponsorStatus = readPaymentStatus(value.sponsorStatus);
  const patientStatus = readPaymentStatus(value.patientStatus);
  if (
    typeof value.name !== "string" ||
    typeof value.description !== "string" ||
    !Number.isInteger(value.workflowVersion) ||
    !Number.isInteger(value.selectedCandidateCount)
  ) {
    throw new Error("OpenChair fixture is missing required scenario fields.");
  }
  const previousOutcomes = Array.isArray(value.previousOutcomes)
    ? value.previousOutcomes.map((entry) => {
        if (
          !isRecord(entry) ||
          typeof entry.displayName !== "string" ||
          typeof entry.outcome !== "string"
        ) {
          throw new Error("OpenChair fixture has an invalid previous outcome.");
        }
        return {
          displayName: entry.displayName,
          outcome: entry.outcome,
        };
      })
    : undefined;

  return {
    name: value.name,
    description: value.description,
    activeStage,
    lastJourneyStage,
    workflowVersion: value.workflowVersion as number,
    selectedCandidateCount: value.selectedCandidateCount as number,
    currentCandidateName: optionalString(value.currentCandidateName),
    acceptedCandidateId: optionalString(value.acceptedCandidateId),
    acceptedPatientName: optionalString(value.acceptedPatientName),
    previousOutcomes,
    sponsorStatus,
    patientStatus,
    blockedReason: optionalString(value.blockedReason),
  };
}

function readEnum<const T extends readonly string[]>(
  value: unknown,
  allowed: T,
  name: string,
): T[number] {
  if (typeof value !== "string" || !allowed.includes(value)) {
    throw new Error(`OpenChair fixture has an invalid ${name}.`);
  }
  return value as T[number];
}

function readPaymentStatus(
  value: unknown,
): PaymentPresentation["sponsor"]["status"] {
  return readEnum(
    value,
    ["waiting", "paid", "failed", "refunded"] as const,
    "payment status",
  );
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
