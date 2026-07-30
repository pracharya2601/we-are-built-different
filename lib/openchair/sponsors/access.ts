import type { WorkspacePermission } from "../../auth/types.ts";
import type {
  AppointmentSponsorRecord,
  SponsorAccessDecision,
} from "./types.ts";

/**
 * Decides whether a caller may act on an appointment's funding.
 *
 * Pure on purpose: the D1 read happens in the repository, so every branch here
 * is directly testable. Two paths grant access and nothing else does.
 *
 * 1. `funds:manage` — the workspace-wide administrator override that all three
 *    funding routes used before appointment sponsorship existed.
 * 2. `product:use` plus an ACTIVE sponsor record for *this* workspace and
 *    *this* appointment.
 *
 * A record belonging to another workspace or appointment is a denial, never a
 * fallthrough: passing the wrong record must not widen access.
 */
export function decideSponsorAccess(input: {
  permissions: readonly WorkspacePermission[];
  workspaceId: string;
  appointmentId: string;
  sponsor: AppointmentSponsorRecord | null;
}): SponsorAccessDecision {
  const permissions = new Set(input.permissions);

  if (permissions.has("funds:manage")) {
    return { allowed: true, via: "funds_manage" };
  }

  if (!permissions.has("product:use")) {
    return { allowed: false, reason: "missing_product_use" };
  }

  const { sponsor } = input;
  if (!sponsor) {
    return { allowed: false, reason: "not_a_sponsor" };
  }
  if (sponsor.workspaceId !== input.workspaceId) {
    return { allowed: false, reason: "workspace_mismatch" };
  }
  if (sponsor.appointmentId !== input.appointmentId) {
    return { allowed: false, reason: "appointment_mismatch" };
  }
  if (sponsor.status !== "ACTIVE") {
    return { allowed: false, reason: "sponsorship_revoked" };
  }

  return { allowed: true, via: "sponsor_relationship" };
}

const DENIAL_MESSAGES: Record<
  Extract<SponsorAccessDecision, { allowed: false }>["reason"],
  string
> = {
  not_a_sponsor: "You do not sponsor this appointment.",
  sponsorship_revoked: "This sponsorship has been revoked.",
  workspace_mismatch: "You do not sponsor this appointment.",
  appointment_mismatch: "You do not sponsor this appointment.",
  missing_product_use: "The product:use workspace permission is required.",
};

export function sponsorDenialMessage(
  reason: Extract<SponsorAccessDecision, { allowed: false }>["reason"],
): string {
  return DENIAL_MESSAGES[reason];
}
