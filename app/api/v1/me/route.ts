import { getDb } from "@/db";
import { withApiAuth } from "@/lib/auth";
import { getActiveWorkspaceMembership } from "@/lib/data";

export const GET = withApiAuth(async function getCurrentPrincipal(
  _request,
  _context,
  auth,
) {
  const membership = await getActiveWorkspaceMembership(
    getDb(),
    auth.userId,
    auth.workspaceId,
  );
  if (!membership) {
    return Response.json(
      {
        error: {
          code: "membership_required",
          message: "An active workspace membership is required.",
        },
      },
      { status: 403, headers: { "cache-control": "no-store" } },
    );
  }
  return Response.json(
    {
      version: 1,
      user: {
        id: auth.userId,
        email: auth.email,
      },
      workspace: {
        id: membership.workspaceId,
        name: membership.workspaceName,
        slug: membership.workspaceSlug,
        type: membership.workspaceType,
        accountType: membership.accountType,
      },
      authorization: {
        roles: auth.roles,
        permissions: auth.permissions,
        tokenAssertions: {
          roles: auth.tokenRoles,
          permissions: auth.tokenPermissions,
        },
      },
    },
    { headers: { "cache-control": "private, no-store" } },
  );
});
