import { getDb } from "../../db";
import { ACCOUNT_POLICIES, type AccountType } from "../accounts";
import { companyConfig } from "../config";
import {
  createDataAuthStore,
  findIdentityBySubject,
  getActiveMembershipsForUser,
} from "../data";
import { permissionsForRoles } from "./authorization";
import type { SignInIntent } from "./sign-in-intent";
import type { AuthSession, WorkspaceRole } from "./types";

export const LOCAL_AUTH_COOKIE = "bd_local_persona";

const LOCAL_AUTH_ISSUER = "urn:openchair:local-development";
const LOCAL_SESSION_SECONDS = 60 * 60 * 12;

export type LocalPersonaId =
  | "service_provider"
  | "nonprofit"
  | "beneficiary";

export type LocalAuthPersona = {
  id: LocalPersonaId;
  accountType: AccountType;
  signInIntent: SignInIntent;
  eyebrow: string;
  title: string;
  description: string;
  displayName: string;
  email: string;
  marker: string;
  platformOwner: boolean;
};

const platformOwnerEmail =
  companyConfig.access.bootstrapOwnerEmails[0] ??
  "platform-owner@openchair.local";

export const LOCAL_AUTH_PERSONAS: readonly LocalAuthPersona[] = [
  {
    id: "service_provider",
    accountType: "service_provider",
    signInIntent: "service_provider",
    eyebrow: "I provide care",
    title: "Service provider",
    description:
      "Open the clinic workspace as its administrator and manage appointment capacity.",
    displayName: "Local Clinic Administrator",
    email: "clinic-admin@openchair.local",
    marker: "01",
    platformOwner: false,
  },
  {
    id: "nonprofit",
    accountType: "nonprofit",
    signInIntent: "nonprofit",
    eyebrow: "I operate the platform",
    title: "Platform owner",
    description:
      "Open the nonprofit workspace with platform-owner access to automation and call logs.",
    displayName: "Local Platform Owner",
    email: platformOwnerEmail,
    marker: "02",
    platformOwner: true,
  },
  {
    id: "beneficiary",
    accountType: "beneficiary",
    signInIntent: "beneficiary",
    eyebrow: "I receive care",
    title: "Beneficiary",
    description:
      "Open a private patient workspace for funded-care and claim-flow development.",
    displayName: "Local Beneficiary",
    email: "beneficiary@openchair.local",
    marker: "03",
    platformOwner: false,
  },
] as const;

export function isLocalAuthEnabled(): boolean {
  return (
    companyConfig.features.authentication === false &&
    readEnv("APP_ENV") === "development" &&
    readEnv("LOCAL_AUTH_BYPASS") === "true"
  );
}

export function normalizeLocalPersona(
  value: FormDataEntryValue | string | null | undefined,
): LocalAuthPersona | null {
  if (typeof value !== "string") return null;
  return LOCAL_AUTH_PERSONAS.find((persona) => persona.id === value) ?? null;
}

export async function provisionLocalPersona(
  persona: LocalAuthPersona,
): Promise<AuthSession> {
  assertLocalAuthEnabled();
  const resolved = await createDataAuthStore(getDb()).resolveIdentity({
    issuer: LOCAL_AUTH_ISSUER,
    subject: persona.id,
    email: persona.email,
    emailVerified: persona.platformOwner,
    displayName: persona.displayName,
    organizationId: null,
    assertedRoles: [ACCOUNT_POLICIES[persona.accountType].defaultRole],
    signInIntent: persona.signInIntent,
  });
  return createLocalSession(
    persona,
    resolved.userId,
    resolved.workspaceId,
    resolved.roles,
  );
}

export async function getLocalPersonaSession(
  personaId: string,
): Promise<AuthSession | null> {
  if (!isLocalAuthEnabled()) return null;
  const persona = normalizeLocalPersona(personaId);
  if (!persona) return null;

  const identity = await findIdentityBySubject(
    getDb(),
    LOCAL_AUTH_ISSUER,
    persona.id,
  );
  if (!identity) return null;
  const memberships = await getActiveMembershipsForUser(
    getDb(),
    identity.userId,
  );
  const membership = memberships.find(
    (item) => item.accountType === persona.accountType,
  );
  if (!membership) return null;
  return createLocalSession(
    persona,
    identity.userId,
    membership.workspaceId,
    [membership.role],
  );
}

export function serializeLocalPersonaCookie(persona: LocalAuthPersona): string {
  return [
    `${LOCAL_AUTH_COOKIE}=${encodeURIComponent(persona.id)}`,
    "Path=/",
    `Max-Age=${LOCAL_SESSION_SECONDS}`,
    "HttpOnly",
    "SameSite=Lax",
  ].join("; ");
}

function createLocalSession(
  persona: LocalAuthPersona,
  userId: string,
  workspaceId: string,
  roles: WorkspaceRole[],
): AuthSession {
  const now = Math.floor(Date.now() / 1000);
  return {
    version: 1,
    mode: "local",
    issuer: LOCAL_AUTH_ISSUER,
    subject: persona.id,
    organizationId: null,
    issuedAt: now,
    expiresAt: now + LOCAL_SESSION_SECONDS,
    userId,
    accountType: persona.accountType,
    email: persona.email,
    roles,
    permissions: permissionsForRoles(roles),
    tokenRoles: [],
    tokenPermissions: [],
    signInIntent: persona.signInIntent,
    workspaceId,
  };
}

function assertLocalAuthEnabled(): void {
  if (!isLocalAuthEnabled()) {
    throw new Error("Local authentication is disabled.");
  }
}

function readEnv(name: string): string | null {
  const value =
    typeof process !== "undefined" ? process.env?.[name]?.trim() : undefined;
  return value || null;
}
