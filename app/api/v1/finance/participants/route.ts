import { getDb } from "@/db";
import { withApiAuth } from "@/lib/auth";
import {
  appendAuditLog,
  getActiveWorkspaceMembership,
} from "@/lib/data";
import {
  PARTICIPANT_ROLES,
  listParticipantRoles,
  setParticipantRole,
  type ParticipantRole,
} from "@/lib/finance";

const ROLES = new Set<string>(PARTICIPANT_ROLES);
const STATUSES = new Set(["active", "suspended"]);

export const GET = withApiAuth(
  async function getParticipants(_request, _context, auth) {
    return Response.json(
      {
        workspaceId: auth.workspaceId,
        participants: await listParticipantRoles(
          getDb(),
          auth.workspaceId,
        ),
      },
      { headers: { "cache-control": "private, no-store" } },
    );
  },
  "funds:view",
);

export const POST = withApiAuth(
  async function assignParticipantRole(request, _context, auth) {
    const body = await readBody(request);
    const userId = typeof body?.userId === "string" ? body.userId : "";
    const role = typeof body?.role === "string" ? body.role : "";
    const status =
      typeof body?.status === "string" ? body.status : "active";
    if (!/^usr_[a-f0-9]{32}$/u.test(userId)) {
      return error("invalid_user", "A valid internal user ID is required.", 400);
    }
    if (!ROLES.has(role)) {
      return error("invalid_participant_role", "Participant role is invalid.", 400);
    }
    if (!STATUSES.has(status)) {
      return error(
        "invalid_participant_status",
        "Participant status must be active or suspended.",
        400,
      );
    }

    const db = getDb();
    const membership = await getActiveWorkspaceMembership(
      db,
      userId,
      auth.workspaceId,
    );
    if (!membership) {
      return error(
        "active_membership_required",
        "Participant roles require an active membership in this workspace.",
        409,
      );
    }
    const participant = await setParticipantRole(db, {
      workspaceId: auth.workspaceId,
      userId,
      role: role as ParticipantRole,
      status: status as "active" | "suspended",
    });
    await appendAuditLog(db, {
      workspaceId: auth.workspaceId,
      actorType: "user",
      actorId: auth.userId,
      action: "finance.participant_role.updated",
      targetType: "participant_role",
      targetId: userId,
      metadata: { role, status },
    });
    return Response.json(
      { participant },
      { status: 201, headers: { "cache-control": "no-store" } },
    );
  },
  "funds:manage",
);

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
