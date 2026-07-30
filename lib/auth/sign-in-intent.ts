export const SIGN_IN_INTENTS = [
  "service_provider",
  "nonprofit",
  "beneficiary",
] as const;

export type SignInIntent = (typeof SIGN_IN_INTENTS)[number];

export function normalizeSignInIntent(
  value: string | null | undefined,
): SignInIntent | null {
  if (value === "benefactor") return "nonprofit";
  if (value === "other") return "beneficiary";
  return SIGN_IN_INTENTS.includes(value as SignInIntent)
    ? (value as SignInIntent)
    : null;
}

export function signInIntentLabel(intent: SignInIntent | null): string | null {
  if (intent === "service_provider") return "Service provider";
  if (intent === "nonprofit") return "Nonprofit or sponsor";
  if (intent === "beneficiary") return "Beneficiary";
  return null;
}
