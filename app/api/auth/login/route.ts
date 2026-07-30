import {
  AuthConfigurationError,
  authSetupPath,
  beginAuth0Login,
  getAuthConfig,
  getAuthSession,
  isLocalAuthEnabled,
  normalizeSignInIntent,
  normalizeLocalPersona,
  provisionLocalPersona,
  safeReturnTo,
  serializeLocalPersonaCookie,
} from "@/lib/auth";
import {
  clearCookie,
  serializeCookie,
  SESSION_COOKIE,
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

  if (isLocalAuthEnabled()) {
    const existingSession = await getAuthSession(request);
    if (existingSession && !forceLogin) {
      return Response.redirect(new URL(returnTo, requestUrl.origin), 302);
    }
    const chooserParams = new URLSearchParams({ returnTo });
    return Response.redirect(
      new URL(`/auth/select-role?${chooserParams.toString()}`, requestUrl.origin),
      302,
    );
  }

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

export async function POST(request: Request): Promise<Response> {
  if (!isLocalAuthEnabled()) {
    return Response.json(
      { error: { code: "local_auth_disabled", message: "Not found." } },
      { status: 404, headers: { "cache-control": "no-store" } },
    );
  }

  const requestUrl = new URL(request.url);
  const returnTo = safeReturnTo(requestUrl.searchParams.get("returnTo"));
  const formData = await request.formData();
  const persona = normalizeLocalPersona(formData.get("persona"));
  if (!persona) {
    return Response.json(
      {
        error: {
          code: "invalid_local_persona",
          message: "Choose one of the available local users.",
        },
      },
      { status: 400, headers: { "cache-control": "no-store" } },
    );
  }

  await provisionLocalPersona(persona);
  const headers = new Headers({
    location: new URL(returnTo, requestUrl.origin).toString(),
    "cache-control": "no-store",
  });
  headers.append("set-cookie", serializeLocalPersonaCookie(persona));
  headers.append("set-cookie", clearCookie(SESSION_COOKIE));
  headers.append("set-cookie", clearCookie(TRANSACTION_COOKIE));
  return new Response(null, { status: 303, headers });
}
