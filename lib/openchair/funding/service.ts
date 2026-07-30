import { and, eq, inArray, lt } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import type { AppDatabase } from "../../../db";
import {
  openchairAppointments,
  openchairFundingRequests,
  openchairPaymentAttempts,
  openchairPayments,
  openchairWorkflows,
  outboxEvents,
} from "../../../db/schema";
import { createId } from "../../data/ids";
import { commitWorkflowFact } from "../workflow/repository.ts";
import { FundingError } from "./errors";
import type { AppointmentPaymentProvider } from "./payment-provider";

export async function approveAppointmentFunding(
  db: AppDatabase,
  input: {
    workspaceId: string;
    appointmentId: string;
    actorUserId: string;
  },
) {
  const existing = await getFundingRequest(
    db,
    input.workspaceId,
    input.appointmentId,
  );
  if (existing) return existing;

  const appointment = (
    await db
      .select()
      .from(openchairAppointments)
      .where(
        and(
          eq(openchairAppointments.id, input.appointmentId),
          eq(openchairAppointments.workspaceId, input.workspaceId),
        ),
      )
      .limit(1)
  )[0];
  if (!appointment) {
    throw new FundingError(
      "appointment_not_found",
      "Appointment was not found.",
      404,
    );
  }
  const workflow = (
    await db
      .select()
      .from(openchairWorkflows)
      .where(
        and(
          eq(openchairWorkflows.appointmentId, input.appointmentId),
          eq(openchairWorkflows.workspaceId, input.workspaceId),
        ),
      )
      .limit(1)
  )[0];
  if (!workflow || workflow.stage !== "FUNDING_APPROVAL") {
    throw new FundingError(
      "funding_not_ready",
      "The appointment is not ready for funding approval.",
      409,
    );
  }
  const currency = appointment.currency.toUpperCase();
  if (
    !Number.isSafeInteger(appointment.discountedPrice) ||
    appointment.discountedPrice <= 0 ||
    appointment.sponsorAmount < 0 ||
    appointment.patientAmount < 0 ||
    appointment.sponsorAmount + appointment.patientAmount !==
      appointment.discountedPrice
  ) {
    throw new FundingError(
      "invalid_funding_split",
      "Sponsor and patient amounts must balance to the discounted price.",
      409,
    );
  }

  const now = new Date();
  const fundingRequestId = createId("fund");
  const requestRecord = {
    id: fundingRequestId,
    workspaceId: input.workspaceId,
    appointmentId: input.appointmentId,
    currency,
    totalAmount: appointment.discountedPrice,
    sponsorAmount: appointment.sponsorAmount,
    patientAmount: appointment.patientAmount,
    status: "APPROVED" as const,
    expiresAt: appointment.expiresAt,
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
  const operations: BatchItem<"sqlite">[] = [
    db.insert(openchairFundingRequests).values(requestRecord),
    db.insert(outboxEvents).values({
      id: createId("evt"),
      aggregateType: "appointment",
      aggregateId: input.appointmentId,
      eventType: "funding.approved",
      schemaVersion: 1,
      payload: {
        workspaceId: input.workspaceId,
        appointmentId: input.appointmentId,
        fundingRequestId,
        sponsorAmount: appointment.sponsorAmount,
        patientAmount: appointment.patientAmount,
        currency,
        actorUserId: input.actorUserId,
      },
      availableAt: now,
      createdAt: now,
      updatedAt: now,
    }),
  ];
  for (const payerType of ["sponsor", "patient"] as const) {
    const amount =
      payerType === "sponsor"
        ? appointment.sponsorAmount
        : appointment.patientAmount;
    if (amount === 0) continue;
    operations.push(
      db.insert(openchairPayments).values({
        id: createId("pay"),
        workspaceId: input.workspaceId,
        appointmentId: input.appointmentId,
        fundingRequestId,
        payerType,
        amount,
        currency,
        status: "PENDING",
        provider: "stripe",
        idempotencyKey: `payment:${fundingRequestId}:${payerType}`,
        expiresAt: appointment.expiresAt,
        createdAt: now,
        updatedAt: now,
      }),
    );
  }
  await db.batch(
    operations as [
      BatchItem<"sqlite">,
      ...BatchItem<"sqlite">[],
    ],
  );
  return requestRecord;
}

export async function createAppointmentCheckout(
  db: AppDatabase,
  provider: AppointmentPaymentProvider,
  input: {
    workspaceId: string;
    appointmentId: string;
    payerType: "sponsor" | "patient";
    idempotencyKey: string;
    successUrl: string;
    cancelUrl: string;
    now?: Date;
  },
) {
  const now = input.now ?? new Date();
  const payment = await getPayment(
    db,
    input.workspaceId,
    input.appointmentId,
    input.payerType,
  );
  if (!payment) {
    throw new FundingError(
      "payment_not_found",
      `No ${input.payerType} payment is required for this appointment.`,
      404,
    );
  }
  if (payment.status === "PAID" || payment.status === "REFUNDED") {
    throw new FundingError(
      "payment_already_final",
      "This contribution has already been finalized.",
      409,
    );
  }
  if (payment.expiresAt <= now) {
    await db
      .update(openchairPayments)
      .set({ status: "EXPIRED", updatedAt: now })
      .where(eq(openchairPayments.id, payment.id));
    throw new FundingError(
      "funding_expired",
      "This appointment funding request has expired.",
      410,
    );
  }

  const workflow = (
    await db
      .select()
      .from(openchairWorkflows)
      .where(eq(openchairWorkflows.appointmentId, input.appointmentId))
      .limit(1)
  )[0];
  const expectedStage =
    input.payerType === "sponsor" ? "FUNDING_APPROVAL" : "PATIENT_ACCEPTED";
  if (
    !workflow ||
    workflow.workspaceId !== input.workspaceId ||
    workflow.stage !== expectedStage ||
    (input.payerType === "patient" && !workflow.sponsorPaid)
  ) {
    throw new FundingError(
      "payment_not_ready",
      `The ${input.payerType} payment is not ready for Checkout.`,
      409,
    );
  }

  const providerResult = await provider.createCheckout({
    paymentId: payment.id,
    appointmentId: payment.appointmentId,
    workspaceId: payment.workspaceId,
    payerType: payment.payerType,
    beneficiaryId: payment.beneficiaryId ?? undefined,
    amount: payment.amount,
    currency: payment.currency,
    expiresAt: payment.expiresAt.toISOString(),
    idempotencyKey: input.idempotencyKey,
    successUrl: input.successUrl,
    cancelUrl: input.cancelUrl,
  });
  const attemptId = createId("payatt");
  const checkoutEventId = createId("evt");
  const correlationId = createId("cor");
  const operations: BatchItem<"sqlite">[] = [
    db
      .insert(openchairPaymentAttempts)
      .values({
        id: attemptId,
        paymentId: payment.id,
        workspaceId: payment.workspaceId,
        providerCheckoutSessionId: providerResult.providerSessionId,
        idempotencyKey: input.idempotencyKey,
        status: "OPEN",
        expiresAt: payment.expiresAt,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          openchairPaymentAttempts.workspaceId,
          openchairPaymentAttempts.idempotencyKey,
        ],
        set: {
          providerCheckoutSessionId: providerResult.providerSessionId,
          status: "OPEN",
          updatedAt: now,
        },
      }),
    db
      .update(openchairPayments)
      .set({
        status: "CHECKOUT_CREATED",
        providerCheckoutSessionId: providerResult.providerSessionId,
        updatedAt: now,
      })
      .where(eq(openchairPayments.id, payment.id)),
  ];
  if (input.payerType === "patient") {
    // The funding module owns this domain event; the workflow module emits the
    // stage change it causes. Both land in the same batch as the payment rows.
    operations.push(
      db.insert(outboxEvents).values({
        id: createId("evt"),
        aggregateType: "appointment",
        aggregateId: payment.appointmentId,
        eventType: "funding.patient_checkout_created",
        schemaVersion: 1,
        payload: {
          workspaceId: payment.workspaceId,
          appointmentId: payment.appointmentId,
          paymentId: payment.id,
          payerType: payment.payerType,
          checkoutSessionId: providerResult.providerSessionId,
        },
        availableAt: now,
        createdAt: now,
        updatedAt: now,
      }),
    );
    await commitWorkflowFact(db, {
      workspaceId: payment.workspaceId,
      appointmentId: payment.appointmentId,
      actor: { type: "service", id: "stripe_checkout" },
      envelope: {
        eventId: checkoutEventId,
        correlationId,
        occurredAt: now.toISOString(),
        fact: { type: "funding.patient_checkout_created" },
      },
      extraOperations: operations,
    });
  } else {
    await db.batch(
      operations as [
        BatchItem<"sqlite">,
        ...BatchItem<"sqlite">[],
      ],
    );
  }
  return {
    paymentId: payment.id,
    payerType: payment.payerType,
    checkoutSessionId: providerResult.providerSessionId,
    url: providerResult.checkoutUrl,
  };
}

export async function requestAppointmentRefund(
  db: AppDatabase,
  provider: AppointmentPaymentProvider,
  input: {
    workspaceId: string;
    appointmentId: string;
    payerType: "sponsor" | "patient";
    idempotencyKey: string;
  },
) {
  const payment = await getPayment(
    db,
    input.workspaceId,
    input.appointmentId,
    input.payerType,
  );
  if (!payment || payment.status !== "PAID" || !payment.providerPaymentId) {
    throw new FundingError(
      "payment_not_refundable",
      "Only a verified paid contribution can be refunded.",
      409,
    );
  }
  const refund = await provider.refund(
    payment.providerPaymentId,
    input.idempotencyKey,
  );
  // Stripe's verified charge.refunded webhook finalizes state and the ledger.
  return { paymentId: payment.id, refundId: refund.providerRefundId };
}

export async function expireAppointmentPayments(
  db: AppDatabase,
  now = new Date(),
): Promise<number> {
  const expired = await db
    .update(openchairPayments)
    .set({ status: "EXPIRED", updatedAt: now })
    .where(
      and(
        inArray(openchairPayments.status, [
          "PENDING",
          "CHECKOUT_CREATED",
          "FAILED",
        ]),
        lt(openchairPayments.expiresAt, now),
      ),
    )
    .returning({ id: openchairPayments.id });
  return expired.length;
}

async function getFundingRequest(
  db: AppDatabase,
  workspaceId: string,
  appointmentId: string,
) {
  return (
    (
      await db
        .select()
        .from(openchairFundingRequests)
        .where(
          and(
            eq(openchairFundingRequests.workspaceId, workspaceId),
            eq(openchairFundingRequests.appointmentId, appointmentId),
          ),
        )
        .limit(1)
    )[0] ?? null
  );
}

export async function getPayment(
  db: AppDatabase,
  workspaceId: string,
  appointmentId: string,
  payerType: "sponsor" | "patient",
) {
  return (
    (
      await db
        .select()
        .from(openchairPayments)
        .where(
          and(
            eq(openchairPayments.workspaceId, workspaceId),
            eq(openchairPayments.appointmentId, appointmentId),
            eq(openchairPayments.payerType, payerType),
          ),
        )
        .limit(1)
    )[0] ?? null
  );
}
