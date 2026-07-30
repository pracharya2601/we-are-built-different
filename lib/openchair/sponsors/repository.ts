import { and, eq } from "drizzle-orm";

import type { AppDatabase } from "../../../db";
import { openchairAppointmentSponsors } from "../../../db/schema";
import { createId } from "../../data/ids";
import type { AppointmentSponsorRecord } from "./types.ts";

/**
 * Reads the sponsor record for one (workspace, appointment, user).
 *
 * Every clause is part of the lookup rather than a post-filter, so a record
 * from another tenant is never loaded in the first place.
 */
export async function findAppointmentSponsor(
  db: AppDatabase,
  workspaceId: string,
  appointmentId: string,
  userId: string,
): Promise<AppointmentSponsorRecord | null> {
  const row = (
    await db
      .select({
        id: openchairAppointmentSponsors.id,
        workspaceId: openchairAppointmentSponsors.workspaceId,
        appointmentId: openchairAppointmentSponsors.appointmentId,
        userId: openchairAppointmentSponsors.userId,
        status: openchairAppointmentSponsors.status,
      })
      .from(openchairAppointmentSponsors)
      .where(
        and(
          eq(openchairAppointmentSponsors.workspaceId, workspaceId),
          eq(openchairAppointmentSponsors.appointmentId, appointmentId),
          eq(openchairAppointmentSponsors.userId, userId),
        ),
      )
      .limit(1)
  )[0];
  return row ?? null;
}

export async function listAppointmentSponsors(
  db: AppDatabase,
  workspaceId: string,
  appointmentId: string,
): Promise<AppointmentSponsorRecord[]> {
  return db
    .select({
      id: openchairAppointmentSponsors.id,
      workspaceId: openchairAppointmentSponsors.workspaceId,
      appointmentId: openchairAppointmentSponsors.appointmentId,
      userId: openchairAppointmentSponsors.userId,
      status: openchairAppointmentSponsors.status,
    })
    .from(openchairAppointmentSponsors)
    .where(
      and(
        eq(openchairAppointmentSponsors.workspaceId, workspaceId),
        eq(openchairAppointmentSponsors.appointmentId, appointmentId),
        eq(openchairAppointmentSponsors.status, "ACTIVE"),
      ),
    );
}

/**
 * Grants sponsorship. Re-granting a revoked sponsorship reactivates the same
 * row rather than creating a second one, so the unique index stays the single
 * source of truth for "does this user sponsor this appointment".
 */
export async function grantAppointmentSponsorship(
  db: AppDatabase,
  input: {
    workspaceId: string;
    appointmentId: string;
    userId: string;
    now?: Date;
  },
): Promise<void> {
  const now = input.now ?? new Date();
  await db
    .insert(openchairAppointmentSponsors)
    .values({
      id: createId("spon"),
      workspaceId: input.workspaceId,
      appointmentId: input.appointmentId,
      userId: input.userId,
      status: "ACTIVE",
      revokedAt: null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        openchairAppointmentSponsors.appointmentId,
        openchairAppointmentSponsors.userId,
      ],
      set: { status: "ACTIVE", revokedAt: null, updatedAt: now },
    });
}

export async function revokeAppointmentSponsorship(
  db: AppDatabase,
  input: {
    workspaceId: string;
    appointmentId: string;
    userId: string;
    now?: Date;
  },
): Promise<void> {
  const now = input.now ?? new Date();
  await db
    .update(openchairAppointmentSponsors)
    .set({ status: "REVOKED", revokedAt: now, updatedAt: now })
    .where(
      and(
        eq(openchairAppointmentSponsors.workspaceId, input.workspaceId),
        eq(openchairAppointmentSponsors.appointmentId, input.appointmentId),
        eq(openchairAppointmentSponsors.userId, input.userId),
      ),
    );
}
