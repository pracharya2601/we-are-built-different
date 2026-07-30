export type AppointmentId = string;
export type BeneficiaryId = string;
export type CandidateId = string;
export type CallAttemptId = string;
export type CorrelationId = string;
export type EventId = string;
export type FundingRequestId = string;
export type PaymentId = string;
export type WorkspaceId = string;

const IDENTIFIER_PATTERN = /^[a-z][a-z0-9]*_[a-f0-9]{32}$/u;

export function isOpenChairIdentifier(value: string): boolean {
  return IDENTIFIER_PATTERN.test(value);
}
