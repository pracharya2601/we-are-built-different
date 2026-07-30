import type { AppointmentId, WorkspaceId } from "../contracts/index.ts";

export type Appointment = {
  id: AppointmentId;
  workspaceId: WorkspaceId;
  clinicName: string;
  startsAt: string;
  durationMinutes: number;
  treatmentType: string;
  currency: string;
  fullPrice: number;
  discountedPrice: number;
  sponsorAmount: number;
  patientAmount: number;
  expiresAt: string;
  version: number;
};

export type CreateAppointmentInput = Omit<
  Appointment,
  "id" | "version"
>;
