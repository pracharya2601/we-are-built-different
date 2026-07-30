import type { AppDatabase } from "../../db";
import {
  createAppointmentCheckout,
  FundingError,
  getPayment,
  type AppointmentPaymentProvider,
} from "../openchair/funding/index.ts";

const DEMO_AMOUNTS = {
  sponsor: 6_000,
  patient: 2_000,
} as const;

export type DemoPaymentStatus =
  | "pending"
  | "checkout_created"
  | "paid"
  | "failed"
  | "expired"
  | "refunded";

export async function createDemoPaymentCheckout(
  db: AppDatabase,
  provider: AppointmentPaymentProvider,
  input: {
    workspaceId: string;
    appointmentId: string;
    payerType: "sponsor" | "patient";
    origin: string;
    idempotencyKey: string;
  },
): Promise<{ checkoutUrl: string }> {
  const payment = await getPayment(
    db,
    input.workspaceId,
    input.appointmentId,
    input.payerType,
  );
  const expectedAmount = DEMO_AMOUNTS[input.payerType];
  if (
    !payment ||
    payment.amount !== expectedAmount ||
    payment.currency.toUpperCase() !== "USD"
  ) {
    throw new FundingError(
      "invalid_demo_payment",
      `The demo ${input.payerType} contribution must be ${formatUsd(expectedAmount)}.`,
      409,
    );
  }

  const checkout = await createAppointmentCheckout(db, provider, {
    workspaceId: input.workspaceId,
    appointmentId: input.appointmentId,
    payerType: input.payerType,
    idempotencyKey: input.idempotencyKey,
    // Returning to the dashboard never updates payment state. Only the signed
    // appointment-funding webhook can mark the contribution paid.
    successUrl: `${input.origin}/demo?checkout=returned`,
    cancelUrl: `${input.origin}/demo?checkout=canceled`,
  });
  return { checkoutUrl: checkout.url };
}

export async function getDemoPaymentSnapshot(
  db: AppDatabase,
  input: { workspaceId: string; appointmentId: string },
) {
  const [sponsor, patient] = await Promise.all([
    getPayment(db, input.workspaceId, input.appointmentId, "sponsor"),
    getPayment(db, input.workspaceId, input.appointmentId, "patient"),
  ]);
  return {
    sponsorPayment: {
      status: normalizeStatus(sponsor?.status),
    },
    patientPayment: {
      status: normalizeStatus(patient?.status),
      linkSent:
        patient?.status !== undefined &&
        patient.status !== "PENDING" &&
        patient.status !== "FAILED" &&
        patient.status !== "EXPIRED",
    },
  };
}

export function demoCheckoutIdempotencyKey(
  request: Request,
  input: {
    workspaceId: string;
    appointmentId: string;
    payerType: "sponsor" | "patient";
  },
): string {
  const supplied = request.headers.get("idempotency-key")?.trim();
  const requestKey =
    supplied && /^[A-Za-z0-9_:.+-]{8,128}$/u.test(supplied)
      ? supplied
      : crypto.randomUUID();
  return [
    "demo",
    input.workspaceId,
    input.appointmentId,
    input.payerType,
    requestKey,
  ].join(":");
}

function normalizeStatus(
  status:
    | "PENDING"
    | "CHECKOUT_CREATED"
    | "PAID"
    | "FAILED"
    | "EXPIRED"
    | "REFUNDED"
    | undefined,
): DemoPaymentStatus {
  return (status?.toLowerCase() ?? "pending") as DemoPaymentStatus;
}

function formatUsd(amount: number): string {
  return `$${(amount / 100).toFixed(2)}`;
}
