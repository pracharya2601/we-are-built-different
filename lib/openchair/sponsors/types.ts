export type AppointmentSponsorStatus = "ACTIVE" | "REVOKED";

/**
 * A durable link between one user and one appointment they sponsor. This is
 * the only evidence that a caller holds the sponsor relationship; a product
 * role, sign-in intent, or `?role=sponsor` fixture parameter is not.
 */
export type AppointmentSponsorRecord = {
  id: string;
  workspaceId: string;
  appointmentId: string;
  userId: string;
  status: AppointmentSponsorStatus;
};

export type SponsorAccessGrantedVia = "sponsor_relationship" | "funds_manage";

export type SponsorAccessDenialReason =
  | "not_a_sponsor"
  | "sponsorship_revoked"
  | "workspace_mismatch"
  | "appointment_mismatch"
  | "missing_product_use";

export type SponsorAccessDecision =
  | { allowed: true; via: SponsorAccessGrantedVia }
  | { allowed: false; reason: SponsorAccessDenialReason };

export class SponsorAccessError extends Error {
  readonly code: SponsorAccessDenialReason;
  readonly status = 403;

  constructor(code: SponsorAccessDenialReason, message: string) {
    super(message);
    this.name = "SponsorAccessError";
    this.code = code;
  }
}
