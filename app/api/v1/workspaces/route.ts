import { getDb } from "@/db";
import { withApiAuth } from "@/lib/auth";
import {
  ACCOUNT_POLICIES,
} from "@/lib/accounts";
import {
  appendAuditLog,
  createWorkspaceWithOwner,
  getActiveMembershipsForUser,
} from "@/lib/data";

export const GET = withApiAuth(async function listWorkspaces(
  _request,
  _context,
  auth,
) {
  const items = await getActiveMembershipsForUser(getDb(), auth.userId);
  return Response.json(
    {
      activeWorkspaceId: auth.workspaceId,
      items: items.map((item) => ({
        id: item.workspaceId,
        name: item.workspaceName,
        slug: item.workspaceSlug,
        type: item.workspaceType,
        accountType: item.accountType,
        role: item.role,
        organizationManaged: Boolean(item.auth0OrganizationId),
      })),
    },
    { headers: { "cache-control": "no-store" } },
  );
});

export const POST = withApiAuth(async function createWorkspace(
  request,
  _context,
  auth,
) {
  const body = await readBody(request);
  if (!body) {
    return error("invalid_json", "A JSON request body is required.", 400);
  }
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (name.length < 2 || name.length > 80) {
    return error(
      "invalid_workspace_name",
      "Workspace names must contain 2 to 80 characters.",
      400,
    );
  }

  const db = getDb();
  const memberships = await getActiveMembershipsForUser(db, auth.userId);
  const active = memberships.find(
    (item) => item.workspaceId === auth.workspaceId,
  );
  if (!active || !ACCOUNT_POLICIES[active.accountType].collaborative) {
    return error(
      "workspace_creation_denied",
      "This account type does not support nested team workspaces.",
      403,
    );
  }

  const created = await createWorkspaceWithOwner(db, {
    ownerUserId: auth.userId,
    name,
    slug: `${slugify(name)}-${crypto.randomUUID().slice(0, 8)}`,
    workspaceType: "team",
    accountType: active.accountType,
    initialRole: ACCOUNT_POLICIES[active.accountType].defaultRole,
  });
  await appendAuditLog(db, {
    workspaceId: created.workspaceId,
    actorType: "user",
    actorId: auth.userId,
    action: "workspace.created",
    targetType: "workspace",
    targetId: created.workspaceId,
    metadata: {
      workspaceType: "team",
      accountType: active.accountType,
    },
  });

  return Response.json(
    {
      workspace: {
        id: created.workspaceId,
        name,
        type: "team",
        accountType: active.accountType,
        role: created.role,
      },
    },
    { status: 201, headers: { "cache-control": "no-store" } },
  );
});

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return slug || "workspace";
}

async function readBody(
  request: Request,
): Promise<Record<string, unknown> | null> {
  try {
    const value: unknown = await request.json();
    return value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function error(code: string, message: string, status: number): Response {
  return Response.json(
    { error: { code, message } },
    { status, headers: { "cache-control": "no-store" } },
  );
}
