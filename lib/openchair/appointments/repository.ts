import type { Appointment, CreateAppointmentInput } from "./types.ts";

export interface AppointmentRepository {
  create(input: CreateAppointmentInput): Promise<Appointment>;
  findById(
    workspaceId: string,
    appointmentId: string,
  ): Promise<Appointment | null>;
}
