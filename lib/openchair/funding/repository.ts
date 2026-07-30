import type { AppointmentId, WorkspaceId } from "../contracts/index.ts";
import type { AppointmentPayment, FundingRequest } from "./types.ts";

export interface FundingRepository {
  findRequest(
    workspaceId: WorkspaceId,
    appointmentId: AppointmentId,
  ): Promise<FundingRequest | null>;
  listPayments(
    workspaceId: WorkspaceId,
    appointmentId: AppointmentId,
  ): Promise<AppointmentPayment[]>;
}
