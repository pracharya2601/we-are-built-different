import {
  AuthConfigurationError,
  authSetupPath,
  beginAuth0Login,
  getAuthConfig,
  getAuthSession,
  normalizeSignInIntent,
  safeReturnTo,
} from "@/lib/auth";
import {
  serializeCookie,
  TRANSACTION_COOKIE,
} from "@/lib/auth/cookies";
import { encodeTransaction } from "@/lib/auth/session";
import { companyConfig } from "@/lib/config";

export async function GET(request: Request): Promise<Response> {
  const requestUrl = new URL(request.url);
  const returnTo = safeReturnTo(requestUrl.searchParams.get("returnTo"));
  const signInIntent = normalizeSignInIntent(
    requestUrl.searchParams.get("intent"),
  );
  const forceLogin = requestUrl.searchParams.get("force") === "1";
  let config;
  try {
    config = getAuthConfig(request.url);
  } catch (error) {
    if (error instanceof AuthConfigurationError) {
      return Response.redirect(
        new URL(authSetupPath(returnTo, signInIntent), requestUrl.origin),
        302,
      );
    }
    throw error;
  }

  const existingSession = await getAuthSession(request);
  if (existingSession && !forceLogin) {
    return Response.redirect(
      new URL(returnTo, config.appBaseUrl),
      302,
    );
  }

  const { transaction, authorizationUrl } = await beginAuth0Login(config, {
    returnTo,
    organizationId:
      requestUrl.searchParams.get("organization") ??
      companyConfig.access.auth0OrganizationId,
    invitation: requestUrl.searchParams.get("invitation"),
    signInIntent,
  });
  const headers = new Headers({ location: authorizationUrl });
  headers.append(
    "set-cookie",
    serializeCookie(
      TRANSACTION_COOKIE,
      await encodeTransaction(transaction, request.url),
      { maxAge: transaction.expiresAt - transaction.createdAt },
    ),
  );
  return new Response(null, { status: 302, headers });
}
