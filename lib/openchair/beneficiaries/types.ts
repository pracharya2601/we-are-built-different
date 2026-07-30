import type {
  AppointmentId,
  BeneficiaryId,
  CandidateId,
  WorkspaceId,
} from "../contracts/index.ts";

export type BeneficiaryConsent = {
  contact: boolean;
  aiVoiceCall: boolean;
  sms: boolean;
  clinicDataSharing: boolean;
};

export type Beneficiary = {
  id: BeneficiaryId;
  workspaceId: WorkspaceId;
  firstName: string;
  lastName: string;
  preferredLanguage: string;
  generalDentalNeed: string;
  availableToday: boolean;
  verificationStatus: "pending" | "verified" | "rejected";
  status: "active" | "suspended" | "archived";
  consent: BeneficiaryConsent;
};

export type Candidate = {
  id: CandidateId;
  appointmentId: AppointmentId;
  beneficiaryId: BeneficiaryId;
  sequenceNumber: number;
  status:
    | "SELECTED"
    | "QUEUED"
    | "CALLING"
    | "NO_ANSWER"
    | "DECLINED"
    | "ACCEPTED"
    | "SKIPPED"
    | "CANCELED";
};
