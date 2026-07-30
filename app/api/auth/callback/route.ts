import {
  AuthError,
  completeAuth0Login,
  getAuthConfig,
} from "@/lib/auth";
import {
  clearCookie,
  readCookie,
  serializeCookie,
  SESSION_COOKIE,
  TRANSACTION_COOKIE,
} from "@/lib/auth/cookies";
import { constantTimeEqual } from "@/lib/auth/crypto";
import {
  decodeTransaction,
  encodeSession,
} from "@/lib/auth/session";
import { getDb } from "@/db";
import { createDataAuthStore } from "@/lib/data";

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const transactionCookie = readCookie(
    request.headers.get("cookie"),
    TRANSACTION_COOKIE,
  );
  const transaction = transactionCookie
    ? await decodeTransaction(transactionCookie, request.url)
    : null;

  try {
    if (!transaction) {
      throw new AuthError(
        "missing_transaction",
        "The login transaction is missing or expired.",
      );
    }
    const state = url.searchParams.get("state");
    const code = url.searchParams.get("code");
    if (!state || !constantTimeEqual(state, transaction.state)) {
      throw new AuthError(
        "invalid_state",
        "The login state is invalid.",
      );
    }
    if (url.searchParams.has("error") || !code) {
      throw new AuthError(
        "authorization_failed",
        "Auth0 did not authorize the login.",
      );
    }

    const config = getAuthConfig(request.url);
    if (config.mode !== "auth0") {
      throw new AuthError(
        "unexpected_callback",
        "Auth0 is not configured.",
        500,
      );
    }
    const session = await completeAuth0Login(config, {
      code,
      transaction,
      identityAdapter: createDataAuthStore(getDb()),
    });
    const headers = new Headers({
      location: new URL(
        transaction.returnTo,
        config.appBaseUrl,
      ).toString(),
    });
    headers.append("set-cookie", clearCookie(TRANSACTION_COOKIE));
    headers.append(
      "set-cookie",
      serializeCookie(
        SESSION_COOKIE,
        await encodeSession(session, request.url),
        { maxAge: session.expiresAt - session.issuedAt },
      ),
    );
    return new Response(null, { status: 302, headers });
  } catch (error) {
    const authError =
      error instanceof AuthError
        ? error
        : new AuthError(
            "callback_failed",
            "The login callback failed.",
            500,
          );
    const headers = new Headers({
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
    });
    headers.append("set-cookie", clearCookie(TRANSACTION_COOKIE));
    return new Response(
      JSON.stringify({
        error: authError.code,
        message: authError.message,
      }),
      { status: authError.status, headers },
    );
  }
}
