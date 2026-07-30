import { and, eq } from "drizzle-orm";

import type { AppDatabase } from "../../../db";
import {
  openchairFundingLedgerEntries,
  openchairFundingRequests,
  openchairPaymentAttempts,
  openchairPayments,
  openchairWorkflowHistory,
  openchairWorkflows,
  outboxEvents,
} from "../../../db/schema";
import { verifyStripeWebhookSignature } from "../../billing/stripe-signature";
import { createId } from "../../data/ids";
import {
  claimProviderEvent,
  completeProviderEvent,
  failProviderEvent,
} from "../../events/inbox";
import { applyWorkflowFact } from "../workflow/state-machine";
import type { WorkflowFact, WorkflowState } from "../workflow/types";
import type { AppointmentFundingConfig } from "./config";
import { FundingError } from "./errors";

type StripeFundingEvent = {
  id: string;
  type: string;
  created: number;
  livemode: boolean;
  data: { object: Record<string, unknown> };
};

const SUPPORTED_EVENTS = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
  "payment_intent.payment_failed",
  "charge.refunded",
]);

export async function ingestAppointmentFundingWebhook(
  request: Request,
  input: {
    db: AppDatabase;
    config: AppointmentFundingConfig;
    now?: Date;
  },
): Promise<{ duplicate: boolean; handled: boolean }> {
  const signatureHeader = request.headers.get("stripe-signature");
  if (!signatureHeader) {
    throw new FundingError(
      "missing_webhook_signature",
      "Stripe-Signature header is required.",
      400,
    );
  }
  const rawBody = await request.text();
  await verifyStripeWebhookSignature({
    payload: rawBody,
    signatureHeader,
    secret: input.config.webhookSecret,
    toleranceSeconds: input.config.webhookToleranceSeconds,
    now: input.now,
  });
  const event = parseEvent(rawBody);
  if (
    input.config.expectedLivemode !== null &&
    event.livemode !== input.config.expectedLivemode
  ) {
    throw new FundingError(
      "stripe_event_mode_mismatch",
      "Stripe event mode does not match appointment funding configuration.",
      400,
    );
  }
  const claim = await claimProviderEvent(input.db, {
    provider: "stripe_appointment_funding",
    providerEventId: event.id,
    eventType: event.type,
    payload: event as unknown as Record<string, unknown>,
    receivedAt: input.now,
  });
  if (!claim.claimed) {
    return {
      duplicate: true,
      handled: SUPPORTED_EVENTS.has(event.type),
    };
  }

  try {
    const handled = await applyFundingEvent(input.db, event);
    await completeProviderEvent(input.db, claim.id);
    return { duplicate: false, handled };
  } catch (error) {
    await failProviderEvent(input.db, claim.id, error);
    throw error;
  }
}

async function applyFundingEvent(
  db: AppDatabase,
  event: StripeFundingEvent,
): Promise<boolean> {
  if (!SUPPORTED_EVENTS.has(event.type)) return false;
  if (event.type === "charge.refunded") {
    return applyRefund(db, event);
  }

  const metadata = readFundingMetadata(event.data.object);
  const payment = await findAndValidatePayment(db, metadata);
  const occurredAt = new Date(event.created * 1000);
  const sessionId =
    event.type.startsWith("checkout.session.") &&
    typeof event.data.object.id === "string"
      ? event.data.object.id
      : null;

  if (
    event.type === "checkout.session.completed" &&
    event.data.object.payment_status !== "paid"
  ) {
    return true;
  }
  if (
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded"
  ) {
    const providerPaymentId = stringId(event.data.object.payment_intent);
    if (!providerPaymentId) {
      throw new FundingError(
        "invalid_payment_event",
        "Paid Checkout event is missing its PaymentIntent.",
        422,
      );
    }
    if (payment.status === "PAID" || payment.status === "REFUNDED") return true;
    const fact: WorkflowFact =
      payment.payerType === "sponsor"
        ? { type: "funding.sponsor_paid" }
        : { type: "funding.patient_paid" };
    const eventId = createId("evt");
    const correlationId = createId("cor");
    const workflowOps = await workflowOperations(db, {
      payment,
      fact,
      eventId,
      correlationId,
      occurredAt,
    });
    await db.batch([
      db
        .update(openchairPayments)
        .set({
          status: "PAID",
          providerPaymentId,
          providerCheckoutSessionId:
            sessionId ?? payment.providerCheckoutSessionId,
          paidAt: occurredAt,
          updatedAt: occurredAt,
        })
        .where(eq(openchairPayments.id, payment.id)),
      db
        .update(openchairPaymentAttempts)
        .set({ status: "COMPLETED", updatedAt: occurredAt })
        .where(
          sessionId
            ? eq(
                openchairPaymentAttempts.providerCheckoutSessionId,
                sessionId,
              )
            : eq(openchairPaymentAttempts.paymentId, payment.id),
        ),
      db
        .update(openchairFundingRequests)
        .set({
          status:
            payment.payerType === "sponsor"
              ? "SPONSOR_PAID"
              : "SPONSOR_PAID",
          version: payment.payerType === "sponsor" ? 2 : 3,
          updatedAt: occurredAt,
        })
        .where(eq(openchairFundingRequests.id, payment.fundingRequestId)),
      db.insert(openchairFundingLedgerEntries).values({
        id: createId("fled"),
        workspaceId: payment.workspaceId,
        appointmentId: payment.appointmentId,
        paymentId: payment.id,
        entryType: "PAYMENT_RECEIVED",
        amount: payment.amount,
        currency: payment.currency,
        providerEventId: event.id,
        providerPaymentId,
        occurredAt,
        createdAt: occurredAt,
      }),
      db.insert(outboxEvents).values({
        id: eventId,
        aggregateType: "appointment",
        aggregateId: payment.appointmentId,
        eventType: fact.type,
        schemaVersion: 1,
        payload: fundingFactPayload(payment, event.id, occurredAt),
        availableAt: occurredAt,
        createdAt: occurredAt,
        updatedAt: occurredAt,
      }),
      ...workflowOps,
    ]);
    return true;
  }

  const status =
    event.type === "checkout.session.expired" ? "EXPIRED" : "FAILED";
  if (payment.status === "PAID" || payment.status === "REFUNDED") return true;
  const fact = { type: "funding.payment_failed" } as const;
  const eventId = createId("evt");
  const workflowOps = await workflowOperations(db, {
    payment,
    fact,
    eventId,
    correlationId: createId("cor"),
    occurredAt,
    allowInvalid: true,
  });
  await db.batch([
    db
      .update(openchairPayments)
      .set({ status, updatedAt: occurredAt })
      .where(eq(openchairPayments.id, payment.id)),
    db
      .update(openchairPaymentAttempts)
      .set({ status, updatedAt: occurredAt })
      .where(
        sessionId
          ? eq(openchairPaymentAttempts.providerCheckoutSessionId, sessionId)
          : eq(openchairPaymentAttempts.paymentId, payment.id),
      ),
    db.insert(outboxEvents).values({
      id: eventId,
      aggregateType: "appointment",
      aggregateId: payment.appointmentId,
      eventType: fact.type,
      schemaVersion: 1,
      payload: fundingFactPayload(payment, event.id, occurredAt),
      availableAt: occurredAt,
      createdAt: occurredAt,
      updatedAt: occurredAt,
    }),
    ...workflowOps,
  ]);
  return true;
}

async function applyRefund(
  db: AppDatabase,
  event: StripeFundingEvent,
): Promise<boolean> {
  const providerPaymentId = stringId(event.data.object.payment_intent);
  if (!providerPaymentId) {
    throw new FundingError(
      "invalid_refund_event",
      "Refunded charge is missing its PaymentIntent.",
      422,
    );
  }
  const payment = (
    await db
      .select()
      .from(openchairPayments)
      .where(eq(openchairPayments.providerPaymentId, providerPaymentId))
      .limit(1)
  )[0];
  if (!payment) {
    throw new FundingError(
      "payment_not_found",
      "Refunded appointment payment was not found.",
      422,
    );
  }
  if (payment.status === "REFUNDED") return true;
  const amountRefunded = event.data.object.amount_refunded;
  if (amountRefunded !== payment.amount) {
    throw new FundingError(
      "partial_refund_not_supported",
      "The MVP supports full appointment contribution refunds only.",
      422,
    );
  }
  const occurredAt = new Date(event.created * 1000);
  const providerRefundId =
    Array.isArray(
      isRecord(event.data.object.refunds)
        ? event.data.object.refunds.data
        : null,
    ) &&
    isRecord(
      (event.data.object.refunds as { data: unknown[] }).data.at(-1),
    ) &&
    typeof (
      (event.data.object.refunds as { data: Record<string, unknown>[] }).data.at(
        -1,
      )
    )?.id === "string"
      ? String(
          (
            event.data.object.refunds as {
              data: Record<string, unknown>[];
            }
          ).data.at(-1)?.id,
        )
      : null;
  const eventId = createId("evt");
  await db.batch([
    db
      .update(openchairPayments)
      .set({
        status: "REFUNDED",
        providerRefundId,
        refundedAt: occurredAt,
        updatedAt: occurredAt,
      })
      .where(eq(openchairPayments.id, payment.id)),
    db
      .update(openchairFundingRequests)
      .set({ status: "REFUNDED", updatedAt: occurredAt })
      .where(eq(openchairFundingRequests.id, payment.fundingRequestId)),
    db.insert(openchairFundingLedgerEntries).values({
      id: createId("fled"),
      workspaceId: payment.workspaceId,
      appointmentId: payment.appointmentId,
      paymentId: payment.id,
      entryType: "REFUND_ISSUED",
      amount: payment.amount,
      currency: payment.currency,
      providerEventId: event.id,
      providerPaymentId,
      providerRefundId,
      occurredAt,
      createdAt: occurredAt,
    }),
    db.insert(outboxEvents).values({
      id: eventId,
      aggregateType: "appointment",
      aggregateId: payment.appointmentId,
      eventType: "funding.refunded",
      schemaVersion: 1,
      payload: fundingFactPayload(payment, event.id, occurredAt),
      availableAt: occurredAt,
      createdAt: occurredAt,
      updatedAt: occurredAt,
    }),
  ]);
  return true;
}

async function workflowOperations(
  db: AppDatabase,
  input: {
    payment: typeof openchairPayments.$inferSelect;
    fact: WorkflowFact;
    eventId: string;
    correlationId: string;
    occurredAt: Date;
    allowInvalid?: boolean;
  },
) {
  const workflow = (
    await db
      .select()
      .from(openchairWorkflows)
      .where(
        and(
          eq(openchairWorkflows.appointmentId, input.payment.appointmentId),
          eq(openchairWorkflows.workspaceId, input.payment.workspaceId),
        ),
      )
      .limit(1)
  )[0];
  if (!workflow) {
    throw new FundingError(
      "workflow_not_found",
      "Appointment workflow was not found.",
      422,
    );
  }
  let transition;
  try {
    transition = applyWorkflowFact(toWorkflowState(workflow), {
      eventId: input.eventId,
      correlationId: input.correlationId,
      occurredAt: input.occurredAt.toISOString(),
      fact: input.fact,
    });
  } catch (error) {
    if (input.allowInvalid) return [];
    throw error;
  }
  if (!transition.changed) return [];
  return [
    db
      .update(openchairWorkflows)
      .set({
        stage: transition.state.stage,
        version: transition.state.version,
        sponsorPaid: transition.state.sponsorPaid,
        patientPaid: transition.state.patientPaid,
        reservedCandidateId: transition.state.reservedCandidateId,
        terminalReason: transition.state.terminalReason,
        updatedAt: input.occurredAt,
      })
      .where(
        and(
          eq(openchairWorkflows.appointmentId, input.payment.appointmentId),
          eq(openchairWorkflows.version, workflow.version),
        ),
      ),
    db.insert(openchairWorkflowHistory).values({
      id: createId("hist"),
      workspaceId: input.payment.workspaceId,
      appointmentId: input.payment.appointmentId,
      workflowVersion: transition.state.version,
      fromStage: transition.previousState.stage,
      toStage: transition.state.stage,
      eventId: input.eventId,
      eventType: input.fact.type,
      correlationId: input.correlationId,
      actorType: "service",
      actorId: "stripe",
      occurredAt: input.occurredAt,
      createdAt: input.occurredAt,
    }),
  ];
}

function toWorkflowState(
  value: typeof openchairWorkflows.$inferSelect,
): WorkflowState {
  return {
    appointmentId: value.appointmentId,
    workspaceId: value.workspaceId,
    stage: value.stage,
    version: value.version,
    sponsorPaid: value.sponsorPaid,
    patientPaid: value.patientPaid,
    reservedCandidateId: value.reservedCandidateId,
    terminalReason: value.terminalReason,
    updatedAt: value.updatedAt.toISOString(),
  };
}

function readFundingMetadata(object: Record<string, unknown>) {
  const metadata = isRecord(object.metadata) ? object.metadata : {};
  if (
    metadata.funding_scope !== "appointment" ||
    typeof metadata.workspace_id !== "string" ||
    typeof metadata.appointment_id !== "string" ||
    typeof metadata.payment_id !== "string" ||
    (metadata.payer_type !== "sponsor" && metadata.payer_type !== "patient")
  ) {
    throw new FundingError(
      "invalid_funding_metadata",
      "Stripe event is missing appointment funding metadata.",
      422,
    );
  }
  return {
    workspaceId: metadata.workspace_id,
    appointmentId: metadata.appointment_id,
    paymentId: metadata.payment_id,
    payerType: metadata.payer_type,
  };
}

async function findAndValidatePayment(
  db: AppDatabase,
  metadata: ReturnType<typeof readFundingMetadata>,
) {
  const payment = (
    await db
      .select()
      .from(openchairPayments)
      .where(eq(openchairPayments.id, metadata.paymentId))
      .limit(1)
  )[0];
  if (
    !payment ||
    payment.workspaceId !== metadata.workspaceId ||
    payment.appointmentId !== metadata.appointmentId ||
    payment.payerType !== metadata.payerType
  ) {
    throw new FundingError(
      "payment_metadata_mismatch",
      "Stripe funding metadata does not match an appointment payment.",
      422,
    );
  }
  return payment;
}

function fundingFactPayload(
  payment: typeof openchairPayments.$inferSelect,
  providerEventId: string,
  occurredAt: Date,
) {
  return {
    workspaceId: payment.workspaceId,
    appointmentId: payment.appointmentId,
    fundingRequestId: payment.fundingRequestId,
    paymentId: payment.id,
    payerType: payment.payerType,
    amount: payment.amount,
    currency: payment.currency,
    provider: "stripe",
    providerEventId,
    occurredAt: occurredAt.toISOString(),
  };
}

function parseEvent(rawBody: string): StripeFundingEvent {
  let value: unknown;
  try {
    value = JSON.parse(rawBody);
  } catch {
    throw new FundingError(
      "invalid_webhook_payload",
      "Stripe webhook body is not valid JSON.",
      400,
    );
  }
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.type !== "string" ||
    typeof value.created !== "number" ||
    typeof value.livemode !== "boolean" ||
    !isRecord(value.data) ||
    !isRecord(value.data.object)
  ) {
    throw new FundingError(
      "invalid_webhook_event",
      "Stripe webhook event is missing required fields.",
      400,
    );
  }
  return value as StripeFundingEvent;
}

function stringId(value: unknown): string | null {
  return typeof value === "string"
    ? value
    : isRecord(value) && typeof value.id === "string"
      ? value.id
      : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
