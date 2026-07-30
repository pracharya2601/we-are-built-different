import type {
  AppointmentId,
  BeneficiaryId,
  FundingRequestId,
  PaymentId,
  WorkspaceId,
} from "../contracts/index.ts";

export type FundingRequest = {
  id: FundingRequestId;
  workspaceId: WorkspaceId;
  appointmentId: AppointmentId;
  currency: string;
  totalAmount: number;
  sponsorAmount: number;
  patientAmount: number;
  status:
    | "PENDING"
    | "APPROVED"
    | "SPONSOR_PAID"
    | "DECLINED"
    | "EXPIRED"
    | "REFUNDED";
  expiresAt: string;
};

export type AppointmentPayment = {
  id: PaymentId;
  workspaceId: WorkspaceId;
  appointmentId: AppointmentId;
  payerType: "sponsor" | "patient";
  beneficiaryId?: BeneficiaryId;
  amount: number;
  currency: string;
  status:
    | "PENDING"
    | "CHECKOUT_CREATED"
    | "PAID"
    | "FAILED"
    | "EXPIRED"
    | "REFUNDED";
};
