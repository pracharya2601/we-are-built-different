import { getAuthConfig } from "@/lib/auth";
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
  const config = getAuthConfig(request.url);

  // Auth0 matches Allowed Logout URLs by exact string; path wildcards are not
  // honored. Sending a deep path such as http://localhost:3000/dashboard makes
  // Auth0 abort with its own error page instead of logging the user out, so the
  // post-logout destination is always the registered app origin. Nothing is
  // lost: every page worth returning to after logout requires a session.
  const logoutUrl = new URL("v2/logout", config.issuer);
  logoutUrl.searchParams.set("client_id", config.clientId);
  logoutUrl.searchParams.set("returnTo", `${config.appBaseUrl}/`);

  const headers = new Headers({
    location: logoutUrl.toString(),
  });
  headers.append("set-cookie", clearCookie(SESSION_COOKIE));
  // Discard any in-flight login transaction too, so a logout cannot leave a
  // usable transaction cookie behind for a later callback.
  headers.append("set-cookie", clearCookie(TRANSACTION_COOKIE));
  return new Response(null, { status: 302, headers });
}
