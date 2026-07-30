import { and, eq } from "drizzle-orm";

import type { AppDatabase } from "../../../db";
import {
  openchairAppointments,
  openchairWorkflows,
} from "../../../db/schema.ts";
import { createId } from "../../data/ids.ts";
import { OpenChairError } from "../shared/errors.ts";
import type { AppointmentRepository } from "./repository.ts";
import type { Appointment, CreateAppointmentInput } from "./types.ts";

type AppointmentRow = typeof openchairAppointments.$inferSelect;

/**
 * D1-backed appointments. Creating an appointment also creates its workflow
 * row in the same batch: an appointment that exists without a workflow could
 * never be published, and every later fact assumes the row is there.
 */
export function createD1AppointmentRepository(
  db: AppDatabase,
  context: { actorUserId: string },
): AppointmentRepository {
  return {
    create: (input) => createAppointment(db, input, context.actorUserId),
    findById: (workspaceId, appointmentId) =>
      findAppointmentById(db, workspaceId, appointmentId),
  };
}

export async function createAppointment(
  db: AppDatabase,
  input: CreateAppointmentInput,
  createdByUserId: string,
): Promise<Appointment> {
  assertValidAppointment(input);

  const now = new Date();
  const appointmentId = createId("appt");
  const row = {
    id: appointmentId,
    workspaceId: input.workspaceId,
    clinicName: input.clinicName,
    startsAt: new Date(input.startsAt),
    durationMinutes: input.durationMinutes,
    treatmentType: input.treatmentType,
    currency: input.currency.toUpperCase(),
    fullPrice: input.fullPrice,
    discountedPrice: input.discountedPrice,
    sponsorAmount: input.sponsorAmount,
    patientAmount: input.patientAmount,
    expiresAt: new Date(input.expiresAt),
    status: "draft" as const,
    version: 1,
    createdByUserId,
    createdAt: now,
    updatedAt: now,
  };

  await db.batch([
    db.insert(openchairAppointments).values(row),
    db.insert(openchairWorkflows).values({
      appointmentId,
      workspaceId: input.workspaceId,
      stage: "OPEN_SLOT",
      version: 1,
      sponsorPaid: false,
      patientPaid: false,
      reservedCandidateId: null,
      terminalReason: null,
      createdAt: now,
      updatedAt: now,
    }),
  ]);

  return toAppointment(row);
}

export async function findAppointmentById(
  db: AppDatabase,
  workspaceId: string,
  appointmentId: string,
): Promise<Appointment | null> {
  const row = (
    await db
      .select()
      .from(openchairAppointments)
      .where(
        and(
          eq(openchairAppointments.id, appointmentId),
          eq(openchairAppointments.workspaceId, workspaceId),
        ),
      )
      .limit(1)
  )[0];
  return row ? toAppointment(row) : null;
}

export function toAppointment(row: AppointmentRow): Appointment {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    clinicName: row.clinicName,
    startsAt: row.startsAt.toISOString(),
    durationMinutes: row.durationMinutes,
    treatmentType: row.treatmentType,
    currency: row.currency,
    fullPrice: row.fullPrice,
    discountedPrice: row.discountedPrice,
    sponsorAmount: row.sponsorAmount,
    patientAmount: row.patientAmount,
    expiresAt: row.expiresAt.toISOString(),
    version: row.version,
  };
}

/**
 * Rejects the same conditions the table's CHECK constraints enforce, so a bad
 * request fails as a typed 422 instead of a D1 constraint error.
 */
export function assertValidAppointment(input: CreateAppointmentInput): void {
  if (input.currency.length !== 3) {
    throw invalid("Currency must be a three-letter code.");
  }
  if (
    !Number.isSafeInteger(input.durationMinutes) ||
    input.durationMinutes < 5 ||
    input.durationMinutes > 480
  ) {
    throw invalid("Duration must be between 5 and 480 minutes.");
  }
  for (const [label, amount] of [
    ["Full price", input.fullPrice],
    ["Discounted price", input.discountedPrice],
    ["Sponsor amount", input.sponsorAmount],
    ["Patient amount", input.patientAmount],
  ] as const) {
    if (!Number.isSafeInteger(amount)) {
      throw invalid(`${label} must be an integer amount in minor units.`);
    }
  }
  if (input.fullPrice <= 0 || input.discountedPrice <= 0) {
    throw invalid("Prices must be greater than zero.");
  }
  if (input.sponsorAmount < 0 || input.patientAmount < 0) {
    throw invalid("Contribution amounts cannot be negative.");
  }
  if (input.sponsorAmount + input.patientAmount !== input.discountedPrice) {
    throw invalid(
      "Sponsor and patient amounts must balance to the discounted price.",
    );
  }
  if (input.fullPrice < input.discountedPrice) {
    throw invalid("The discounted price cannot exceed the full price.");
  }
  const startsAt = Date.parse(input.startsAt);
  const expiresAt = Date.parse(input.expiresAt);
  if (Number.isNaN(startsAt) || Number.isNaN(expiresAt)) {
    throw invalid("Start and expiry must be valid timestamps.");
  }
  if (expiresAt > startsAt) {
    throw invalid("The claim cutoff must not fall after the appointment.");
  }
}

function invalid(message: string): OpenChairError {
  return new OpenChairError("invalid_appointment", message, 422);
}
