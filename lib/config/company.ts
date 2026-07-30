import rawConfig from "../../config/company.json";

type CompanyConfig = {
  company: {
    id: string;
    name: string;
    legalName: string;
    shortName: string;
    mark: string;
    supportEmail: string | null;
    website: string | null;
  };
  application: {
    name: string;
    description: string;
    defaultWorkspaceName: string;
    defaultWorkspaceSlug: string;
  };
  features: {
    billing: boolean;
    multiTenant: boolean;
    publicLandingPage: boolean;
  };
  access: {
    auth0OrganizationId: string | null;
    bootstrapOwnerEmails: string[];
    allowedEmailDomains: string[];
  };
  entitlements: {
    productAccessKey: string;
  };
  branding: {
    accent: string;
    accentDark: string;
    background: string;
    foreground: string;
  };
};

function assertNonEmpty(value: string, path: string): void {
  if (!value.trim()) throw new Error(`${path} must not be empty.`);
}

function validateConfig(config: CompanyConfig): CompanyConfig {
  assertNonEmpty(config.company.id, "company.id");
  assertNonEmpty(config.company.name, "company.name");
  assertNonEmpty(config.company.mark, "company.mark");
  assertNonEmpty(config.application.name, "application.name");
  assertNonEmpty(
    config.application.defaultWorkspaceName,
    "application.defaultWorkspaceName",
  );
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(
    config.application.defaultWorkspaceSlug,
  )) {
    throw new Error(
      "application.defaultWorkspaceSlug must be a lowercase URL slug.",
    );
  }
  if (
    config.access.auth0OrganizationId !== null &&
    !/^org_[A-Za-z0-9]+$/u.test(config.access.auth0OrganizationId)
  ) {
    throw new Error("access.auth0OrganizationId must be an Auth0 org ID.");
  }
  if (!/^[a-z][a-z0-9_]*$/u.test(config.entitlements.productAccessKey)) {
    throw new Error(
      "entitlements.productAccessKey must use lowercase snake_case.",
    );
  }
  for (const color of Object.values(config.branding)) {
    if (!/^#[0-9A-Fa-f]{6}$/u.test(color)) {
      throw new Error("Brand colors must use six-digit hexadecimal values.");
    }
  }

  return Object.freeze(config);
}

export const companyConfig = validateConfig(rawConfig);

export function canBootstrapCompany(email: string | null): boolean {
  if (!email) return false;
  const normalizedEmail = email.trim().toLowerCase();
  const allowedEmails = companyConfig.access.bootstrapOwnerEmails.map((value) =>
    value.trim().toLowerCase(),
  );
  if (!allowedEmails.includes(normalizedEmail)) return false;

  const allowedDomains = companyConfig.access.allowedEmailDomains.map((value) =>
    value.trim().toLowerCase(),
  );
  if (allowedDomains.length === 0) return true;
  return allowedDomains.includes(normalizedEmail.split("@")[1] ?? "");
}
