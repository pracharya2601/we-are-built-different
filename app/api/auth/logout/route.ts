import {
  getAuthConfig,
  isLocalAuthEnabled,
  LOCAL_AUTH_COOKIE,
  safeReturnTo,
} from "@/lib/auth";
import {
  clearCookie,
  SESSION_COOKIE,
  TRANSACTION_COOKIE,
} from "@/lib/auth/cookies";

export async function GET(request: Request): Promise<Response> {
  return logout(request);
}

export async function POST(request: Request): Promise<Response> {
  return logout(request);
}

function logout(request: Request): Response {
  const url = new URL(request.url);
  const returnTo = safeReturnTo(url.searchParams.get("returnTo"));

  if (isLocalAuthEnabled()) {
    const nextPath = returnTo === "/" ? "/dashboard" : returnTo;
    const chooserUrl = new URL("/auth/select-role", url.origin);
    chooserUrl.searchParams.set("returnTo", nextPath);
    const headers = new Headers({ location: chooserUrl.toString() });
    headers.append("set-cookie", clearCookie(LOCAL_AUTH_COOKIE));
    headers.append("set-cookie", clearCookie(SESSION_COOKIE));
    headers.append("set-cookie", clearCookie(TRANSACTION_COOKIE));
    return new Response(null, { status: 302, headers });
  }

  const config = getAuthConfig(request.url);
  const localReturnUrl = new URL(returnTo, config.appBaseUrl).toString();

  const logoutUrl = new URL("v2/logout", config.issuer);
  logoutUrl.searchParams.set("client_id", config.clientId);
  logoutUrl.searchParams.set("returnTo", localReturnUrl);

  const headers = new Headers({
    location: logoutUrl.toString(),
  });
  headers.append("set-cookie", clearCookie(SESSION_COOKIE));
  return new Response(null, { status: 302, headers });
}
