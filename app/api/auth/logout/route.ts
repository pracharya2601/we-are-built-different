import { getAuthConfig, safeReturnTo } from "@/lib/auth";
import { clearCookie, SESSION_COOKIE } from "@/lib/auth/cookies";

export async function GET(request: Request): Promise<Response> {
  return logout(request);
}

export async function POST(request: Request): Promise<Response> {
  return logout(request);
}

function logout(request: Request): Response {
  const url = new URL(request.url);
  const config = getAuthConfig(request.url);
  const returnTo = safeReturnTo(url.searchParams.get("returnTo"));
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
