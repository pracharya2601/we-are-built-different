import { getDb } from "@/db";
import { requireAuthContext } from "@/lib/auth";
import { getWorkspaceAccess } from "@/lib/data";

export async function GET(
  request: Request,
  context: { params: Promise<{ workspaceId: string }> },
): Promise<Response> {
  const auth = await requireAuthContext(request);
  const { workspaceId } = await context.params;

  if (workspaceId !== auth.workspaceId) {
    return Response.json(
      { error: "workspace_access_denied" },
      { status: 403, headers: { "cache-control": "no-store" } },
    );
  }

  const accessState = await getWorkspaceAccess(getDb(), workspaceId);
  return Response.json(
    {
      workspaceId,
      revision: 1,
      entitlements: [
        {
          key: "platform_access",
          state: accessState,
          active: ["active", "trialing", "grace"].includes(accessState),
        },
      ],
    },
    { headers: { "cache-control": "no-store" } },
  );
}
