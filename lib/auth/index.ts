export {
  ROLE_LABELS,
  ROLE_PERMISSIONS,
  canManageRole,
  effectivePermissions,
  overridesForEffectivePermissions,
  permissionsForRoles,
  roleHasPermission,
  type PermissionOverride,
} from "./authorization";
export {
  getAuthContext,
  getAuthMode,
  getAuthSession,
  requireAuthContext,
  requireWorkspacePermission,
} from "./context";
export {
  AuthConfigurationError,
  authSetupPath,
  getAuthConfig,
  getAuthConfigurationStatus,
  isAuth0Configured,
} from "./config";
export type { AuthConfig } from "./config";
export {
  AuthGuard,
  DashboardAccessGuard,
  withApiAuth,
  withPlatformOwner,
} from "./guards";
export { PlatformOwnerGuard, requirePlatformOwner } from "./platform";
export {
  deterministicIdentityAdapter,
  parsePermissions,
  parseWorkspaceRoles,
  type AuthIdentityAdapter,
  type ExternalIdentity,
  type ResolvedIdentity,
} from "./identity";
export {
  authCallbackUrl,
  beginAuth0Login,
  completeAuth0Login,
  safeReturnTo,
} from "./flow";
export {
  AUTH_FAILURE_PATH,
  authFailurePath,
  describeAuthFailure,
  normalizeAuthFailureCode,
  prefersHtml,
  type AuthFailureCopy,
} from "./failure";
export {
  normalizeSignInIntent,
  signInIntentLabel,
  SIGN_IN_INTENTS,
  type SignInIntent,
} from "./sign-in-intent";
export {
  getLocalPersonaSession,
  isLocalAuthEnabled,
  LOCAL_AUTH_COOKIE,
  LOCAL_AUTH_PERSONAS,
  normalizeLocalPersona,
  provisionLocalPersona,
  serializeLocalPersonaCookie,
  type LocalAuthPersona,
  type LocalPersonaId,
} from "./local";
export {
  AuthError,
  WORKSPACE_PERMISSIONS,
  WORKSPACE_ROLES,
  type AuthContext,
  type AuthMode,
  type AuthSession,
  type WorkspacePermission,
  type WorkspaceRole,
} from "./types";
