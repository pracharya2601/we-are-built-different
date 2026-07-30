import {
  beginAuth0Login,
  createDemoSession,
  getAuthConfig,
  safeReturnTo,
} from "@/lib/auth";
import {
  serializeCookie,
  SESSION_COOKIE,
  TRANSACTION_COOKIE,
} from "@/lib/auth/cookies";
import { encodeSession, encodeTransaction } from "@/lib/auth/session";

export async function GET(request: Request): Promise<Response> {
  const requestUrl = new URL(request.url);
  const config = getAuthConfig(request.url);
  const returnTo = safeReturnTo(requestUrl.searchParams.get("returnTo"));

  if (config.mode === "demo") {
    const session = createDemoSession();
    const headers = new Headers({
      location: new URL(returnTo, config.appBaseUrl).toString(),
    });
    headers.append(
      "set-cookie",
      serializeCookie(
        SESSION_COOKIE,
        await encodeSession(session, request.url),
        { maxAge: session.expiresAt - session.issuedAt },
      ),
    );
    return new Response(null, { status: 302, headers });
  }

  const { transaction, authorizationUrl } = await beginAuth0Login(config, {
    returnTo,
    organizationId: requestUrl.searchParams.get("organization"),
    invitation: requestUrl.searchParams.get("invitation"),
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
