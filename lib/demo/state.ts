import { and, desc, eq } from "drizzle-orm";

import type { AppDatabase } from "../../db";
import {
  callJobs,
  openchairAppointmentSponsors,
  openchairAppointments,
  openchairBeneficiaries,
  openchairCandidates,
  openchairWorkflows,
} from "../../db/schema";
import { sha256 } from "../auth/crypto";
import {
  getCallDataEncryptionKey,
  getCallRuntimeEnvironment,
  protectCallRecipient,
} from "../calls";

export const DEMO_PATIENT = {
  id: "maria",
  name: "Maria Delgado",
  phoneNumber: "+17097656030",
  language: "English",
  consentConfirmed: true,
} as const;

export const DEMO_APPOINTMENT = {
  clinicName: "Mission Community Dental",
  treatmentType: "Cleaning + exam",
  durationMinutes: 60,
  currency: "USD",
  fullPrice: 8_000,
  discountedPrice: 8_000,
  sponsorAmount: 6_000,
  patientAmount: 2_000,
} as const;

export type DemoRun = {
  workspaceId: string;
  appointmentId: string;
  beneficiaryId: string;
  candidateId: string;
  callJobId: string | null;
};

export async function getOrCreateDemoRun(
  db: AppDatabase,
  input: { workspaceId: string; userId: string },
): Promise<DemoRun> {
  const ids = await demoIds(input.workspaceId);
  const now = new Date();
  const startsAt = new Date(now.getTime() + 2 * 60 * 60_000);
  const expiresAt = new Date(now.getTime() + 60 * 60_000);
  const encryptionKey = getCallDataEncryptionKey(
    getCallRuntimeEnvironment(),
  );
  const contactDataCiphertext = await protectCallRecipient(
    {
      name: DEMO_PATIENT.name,
      phoneNumber: DEMO_PATIENT.phoneNumber,
      dentalAvailability: startsAt.toISOString(),
      approvedContext: DEMO_APPOINTMENT.treatmentType,
      timezone: "America/St_Johns",
      consentConfirmed: true,
    },
    encryptionKey,
  );

  await db.batch([
    db
      .insert(openchairAppointments)
      .values({
        id: ids.appointmentId,
        workspaceId: input.workspaceId,
        clinicName: DEMO_APPOINTMENT.clinicName,
        startsAt,
        durationMinutes: DEMO_APPOINTMENT.durationMinutes,
        treatmentType: DEMO_APPOINTMENT.treatmentType,
        currency: DEMO_APPOINTMENT.currency,
        fullPrice: DEMO_APPOINTMENT.fullPrice,
        discountedPrice: DEMO_APPOINTMENT.discountedPrice,
        sponsorAmount: DEMO_APPOINTMENT.sponsorAmount,
        patientAmount: DEMO_APPOINTMENT.patientAmount,
        expiresAt,
        status: "draft",
        version: 1,
        createdByUserId: input.userId,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing(),
    db
      .insert(openchairWorkflows)
      .values({
        appointmentId: ids.appointmentId,
        workspaceId: input.workspaceId,
        stage: "OPEN_SLOT",
        version: 1,
        sponsorPaid: false,
        patientPaid: false,
        reservedCandidateId: null,
        terminalReason: null,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing(),
    db
      .insert(openchairBeneficiaries)
      .values({
        id: ids.beneficiaryId,
        workspaceId: input.workspaceId,
        firstName: "Maria",
        lastName: "Delgado",
        contactDataCiphertext,
        phoneLast4: DEMO_PATIENT.phoneNumber.slice(-4),
        preferredLanguage: DEMO_PATIENT.language,
        generalDentalNeed: DEMO_APPOINTMENT.treatmentType,
        availableToday: true,
        contactConsent: true,
        aiVoiceCallConsent: true,
        smsConsent: true,
        clinicDataSharingConsent: true,
        verificationStatus: "verified",
        status: "active",
        createdByUserId: input.userId,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing(),
    db
      .insert(openchairCandidates)
      .values({
        id: ids.candidateId,
        workspaceId: input.workspaceId,
        appointmentId: ids.appointmentId,
        beneficiaryId: ids.beneficiaryId,
        sequenceNumber: 1,
        status: "SELECTED",
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing(),
    db
      .insert(openchairAppointmentSponsors)
      .values({
        id: await demoId("spon", `${input.workspaceId}:${input.userId}`),
        workspaceId: input.workspaceId,
        appointmentId: ids.appointmentId,
        userId: input.userId,
        status: "ACTIVE",
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing(),
  ]);

  return (await getDemoRun(db, input.workspaceId)) ?? {
    workspaceId: input.workspaceId,
    ...ids,
    callJobId: null,
  };
}

export async function getDemoRun(
  db: AppDatabase,
  workspaceId: string,
): Promise<DemoRun | null> {
  const ids = await demoIds(workspaceId);
  const appointment = (
    await db
      .select({ id: openchairAppointments.id })
      .from(openchairAppointments)
      .where(
        and(
          eq(openchairAppointments.id, ids.appointmentId),
          eq(openchairAppointments.workspaceId, workspaceId),
        ),
      )
      .limit(1)
  )[0];
  if (!appointment) return null;

  const latestCall = (
    await db
      .select({ id: callJobs.id })
      .from(callJobs)
      .where(
        and(
          eq(callJobs.workspaceId, workspaceId),
          eq(callJobs.recipientPhoneLast4, DEMO_PATIENT.phoneNumber.slice(-4)),
        ),
      )
      .orderBy(desc(callJobs.createdAt))
      .limit(1)
  )[0];

  return {
    workspaceId,
    ...ids,
    callJobId: latestCall?.id ?? null,
  };
}

async function demoIds(workspaceId: string) {
  return {
    appointmentId: await demoId("appt", workspaceId),
    beneficiaryId: await demoId("ben", workspaceId),
    candidateId: await demoId("cand", workspaceId),
  };
}

async function demoId(prefix: string, value: string): Promise<string> {
  const digest = await sha256(`openchair-demo:${prefix}:${value}`);
  const hex = Array.from(digest.slice(0, 16), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `${prefix}_${hex}`;
}
