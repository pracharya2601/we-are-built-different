export const PARTICIPANT_ROLES = [
  "service_provider",
  "benefactor",
  "beneficiary",
] as const;

export type ParticipantRole = (typeof PARTICIPANT_ROLES)[number];

export type MoneyFlowKind =
  | "benefactor_deposit"
  | "beneficiary_allocation"
  | "service_provider_payment";

export type LedgerDirection = "debit" | "credit";

export type LedgerLine = {
  accountKey: "cash" | "available" | "beneficiary_allocated";
  direction: LedgerDirection;
  amount: number;
};

export type MoneyFlow = {
  kind: MoneyFlowKind;
  amount: number;
  currency: string;
  benefactorUserId?: string | null;
  beneficiaryUserId?: string | null;
  serviceProviderUserId?: string | null;
};
