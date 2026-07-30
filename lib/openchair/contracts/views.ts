import type { AppointmentId, CandidateId } from "./identifiers.ts";
import type { OpenChairAction, ViewerRole } from "./permissions.ts";
import type {
  JourneyStage,
  StageStatus,
  WorkflowStage,
} from "./stages.ts";

export type AppointmentSummary = {
  appointmentId: AppointmentId;
  clinicName: string;
  startsAt: string;
  durationMinutes: number;
  treatmentType: string;
  currency: string;
  fullPrice: number;
  discountedPrice: number;
  sponsorAmount: number;
  patientAmount: number;
  expiresAt: string;
};

export type StagePresentation = {
  stage: JourneyStage;
  label: string;
  status: StageStatus;
};

export type PaymentPresentation = {
  sponsor: {
    amount: number;
    status: "waiting" | "paid" | "failed" | "refunded";
  };
  patient: {
    amount: number;
    status: "waiting" | "paid" | "failed" | "refunded";
  };
};

export type WorkflowPanelData = {
  selectedCandidateCount?: number;
  currentCandidateName?: string;
  acceptedCandidateId?: CandidateId;
  acceptedPatientName?: string;
  previousOutcomes?: Array<{
    displayName: string;
    outcome: string;
  }>;
  payments?: PaymentPresentation;
  blockedReason?: string;
};

export type WorkflowProjection = {
  appointment: AppointmentSummary;
  activeStage: WorkflowStage;
  stages: StagePresentation[];
  viewerRole: ViewerRole;
  panelType: JourneyStage | "TERMINAL";
  panelData: WorkflowPanelData;
  allowedActions: OpenChairAction[];
  workflowVersion: number;
  lastUpdatedAt: string;
  fixture?: {
    name: string;
    description: string;
  };
};
