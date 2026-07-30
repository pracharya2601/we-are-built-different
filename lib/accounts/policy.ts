export const ACCOUNT_TYPES = [
  "service_provider",
  "nonprofit",
  "beneficiary",
] as const;

export type AccountType = (typeof ACCOUNT_TYPES)[number];

export type AccountPolicy = {
  label: string;
  description: string;
  collaborative: boolean;
  dashboardRequiresSubscription: boolean;
  allowedPlanKeys: readonly ("platform-lite" | "platform-pro")[];
  defaultRole: "admin";
};

export const ACCOUNT_POLICIES: Record<AccountType, AccountPolicy> = {
  service_provider: {
    label: "Service provider",
    description: "Delivers care and receives payment.",
    collaborative: true,
    dashboardRequiresSubscription: true,
    allowedPlanKeys: ["platform-pro"],
    defaultRole: "admin",
  },
  nonprofit: {
    label: "Nonprofit or sponsor",
    description: "Funds care and manages giving workflows.",
    collaborative: true,
    dashboardRequiresSubscription: false,
    allowedPlanKeys: ["platform-lite", "platform-pro"],
    defaultRole: "admin",
  },
  beneficiary: {
    label: "Beneficiary",
    description: "Claims or receives funded care.",
    collaborative: false,
    dashboardRequiresSubscription: false,
    allowedPlanKeys: ["platform-lite", "platform-pro"],
    defaultRole: "admin",
  },
};

export function isAccountType(value: unknown): value is AccountType {
  return (
    typeof value === "string" &&
    (ACCOUNT_TYPES as readonly string[]).includes(value)
  );
}

export function accountTypeFromSignInIntent(
  intent: string | null | undefined,
): AccountType {
  if (intent === "service_provider") return "service_provider";
  if (intent === "nonprofit" || intent === "benefactor") return "nonprofit";
  return "beneficiary";
}

export function planAllowedForAccount(
  accountType: AccountType,
  planKey: string,
): boolean {
  return ACCOUNT_POLICIES[accountType].allowedPlanKeys.includes(
    planKey as "platform-lite" | "platform-pro",
  );
}
