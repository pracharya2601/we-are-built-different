import type {
  AppointmentId,
  BeneficiaryId,
  PaymentId,
  WorkspaceId,
} from "../contracts/index.ts";

export type AppointmentCheckoutRequest = {
  paymentId: PaymentId;
  appointmentId: AppointmentId;
  workspaceId: WorkspaceId;
  payerType: "sponsor" | "patient";
  beneficiaryId?: BeneficiaryId;
  amount: number;
  currency: string;
  expiresAt: string;
  idempotencyKey: string;
  successUrl: string;
  cancelUrl: string;
};

export interface AppointmentPaymentProvider {
  createCheckout(
    input: AppointmentCheckoutRequest,
  ): Promise<{ providerSessionId: string; checkoutUrl: string }>;
  refund(
    providerPaymentId: string,
    idempotencyKey: string,
  ): Promise<{ providerRefundId: string }>;
}
