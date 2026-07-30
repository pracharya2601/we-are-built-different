import type { Beneficiary } from "./types.ts";

export function beneficiaryCanBeSelected(
  beneficiary: Beneficiary,
): boolean {
  return (
    beneficiary.status === "active" &&
    beneficiary.verificationStatus === "verified" &&
    beneficiary.availableToday &&
    beneficiary.consent.contact &&
    beneficiary.consent.aiVoiceCall &&
    beneficiary.consent.clinicDataSharing
  );
}
