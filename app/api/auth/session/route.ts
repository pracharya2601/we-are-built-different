import { getAuthContext, getAuthMode } from "@/lib/auth";

export async function GET(request: Request): Promise<Response> {
  const [context, mode] = await Promise.all([
    getAuthContext(request),
    getAuthMode(request),
  ]);
  return Response.json(
    { authenticated: context !== null, mode, user: context },
    { headers: { "cache-control": "no-store" } },
  );
}
