import type { AppDatabase } from "../../../db";
import type { AuthContext } from "../../auth/types.ts";
import { decideSponsorAccess, sponsorDenialMessage } from "./access.ts";
import { findAppointmentSponsor } from "./repository.ts";
import { SponsorAccessError, type SponsorAccessGrantedVia } from "./types.ts";

export { decideSponsorAccess, sponsorDenialMessage } from "./access.ts";
export {
  findAppointmentSponsor,
  grantAppointmentSponsorship,
  listAppointmentSponsors,
  revokeAppointmentSponsorship,
} from "./repository.ts";
export {
  SponsorAccessError,
  type AppointmentSponsorRecord,
  type AppointmentSponsorStatus,
  type SponsorAccessDecision,
} from "./types.ts";

/**
 * Route-level guard. `withApiAuth(handler, "product:use")` proves membership;
 * this proves the caller may act on *this* appointment's funding.
 *
 * Throws `SponsorAccessError` (403) on denial, which the funding error
 * responder renders as JSON because it carries `code` and `status`.
 */
export async function requireAppointmentSponsor(
  db: AppDatabase,
  auth: Pick<AuthContext, "userId" | "workspaceId" | "permissions">,
  appointmentId: string,
): Promise<SponsorAccessGrantedVia> {
  const sponsor = auth.permissions.includes("funds:manage")
    ? null
    : await findAppointmentSponsor(
        db,
        auth.workspaceId,
        appointmentId,
        auth.userId,
      );

  const decision = decideSponsorAccess({
    permissions: auth.permissions,
    workspaceId: auth.workspaceId,
    appointmentId,
    sponsor,
  });

  if (!decision.allowed) {
    throw new SponsorAccessError(
      decision.reason,
      sponsorDenialMessage(decision.reason),
    );
  }
  return decision.via;
}
