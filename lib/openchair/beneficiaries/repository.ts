import type { AppointmentId, WorkspaceId } from "../contracts/index.ts";
import type { Beneficiary, Candidate } from "./types.ts";

export interface BeneficiaryRepository {
  findById(
    workspaceId: WorkspaceId,
    beneficiaryId: string,
  ): Promise<Beneficiary | null>;
  listEligible(workspaceId: WorkspaceId): Promise<Beneficiary[]>;
  listApprovedCandidates(
    workspaceId: WorkspaceId,
    appointmentId: AppointmentId,
  ): Promise<Candidate[]>;
}
