import {
  getAuthConfigurationStatus,
  getAuthContext,
  getAuthMode,
} from "@/lib/auth";

export async function GET(request: Request): Promise<Response> {
  const status = getAuthConfigurationStatus();
  if (!status.configured) {
    return Response.json(
      {
        authenticated: false,
        mode: "auth0",
        user: null,
        configuration: {
          ready: false,
          missing: status.missing,
        },
      },
      {
        status: 503,
        headers: { "cache-control": "no-store" },
      },
    );
  }
  const [context, mode] = await Promise.all([
    getAuthContext(request),
    getAuthMode(request),
  ]);
  return Response.json(
    { authenticated: context !== null, mode, user: context },
    { headers: { "cache-control": "no-store" } },
  );
}
