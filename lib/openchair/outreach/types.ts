import type {
  AppointmentId,
  CallAttemptId,
  CandidateId,
  CorrelationId,
} from "../contracts/index.ts";

export const OUTREACH_OUTCOMES = [
  "ACCEPTED",
  "DECLINED",
  "NO_ANSWER",
  "VOICEMAIL",
  "BUSY",
  "WRONG_NUMBER",
  "CALL_FAILED",
  "HUMAN_REVIEW",
] as const;

export type OutreachOutcome = (typeof OUTREACH_OUTCOMES)[number];

export type OutreachQueueMessage = {
  version: 1;
  appointmentId: AppointmentId;
  candidateId: CandidateId;
  callAttemptId: CallAttemptId;
  expectedWorkflowVersion: number;
  correlationId: CorrelationId;
};

export type OutreachCallResult = {
  outcome: OutreachOutcome;
  identityConfirmed: boolean | null;
  canAttend: boolean | null;
  priceAccepted: boolean | null;
  sendPaymentLink: boolean | null;
  dataSharingConsent: boolean | null;
  preferredLanguage: string | null;
  humanReviewRequired: boolean;
};
