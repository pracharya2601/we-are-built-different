import { and, eq } from "drizzle-orm";

import type { AppDatabase } from "../../../db/index.ts";
import {
  openchairAppointmentParticipants,
  openchairAppointments,
  platformOperators,
} from "../../../db/schema.ts";
import type {
  OpenChairAction,
  ViewerRole,
} from "../contracts/index.ts";
import type {
  AppointmentRelationships,
  OpenChairAuthorizationContext,
} from "./frontend-access.ts";

export type LiveWorkflowViewer = {
  workspaceId: string;
  userId: string;
};

export type LiveOpenChairContext = OpenChairAuthorizationContext & {
  viewerRole: ViewerRole;
};

type AppointmentIdentity = {
  id: string;
  createdByUserId: string;
};

export async function resolveLiveOpenChairContext(
  db: AppDatabase,
  viewer: LiveWorkflowViewer,
  appointmentId: string,
): Promise<LiveOpenChairContext | null> {
  const [appointment] = await db
    .select({
      id: openchairAppointments.id,
      createdByUserId: openchairAppointments.createdByUserId,
    })
    .from(openchairAppointments)
    .where(
      and(
        eq(openchairAppointments.workspaceId, viewer.workspaceId),
        eq(openchairAppointments.id, appointmentId),
      ),
    )
    .limit(1);
  if (!appointment) return null;
  return resolveLiveOpenChairContextForAppointment(db, viewer, appointment);
}

export async function resolveLiveOpenChairContextForAppointment(
  db: AppDatabase,
  viewer: LiveWorkflowViewer,
  appointment: AppointmentIdentity,
): Promise<LiveOpenChairContext | null> {
  const [participantRows, operatorRows] = await Promise.all([
    db
      .select({
        relationship: openchairAppointmentParticipants.relationship,
      })
      .from(openchairAppointmentParticipants)
      .where(
        and(
          eq(
            openchairAppointmentParticipants.workspaceId,
            viewer.workspaceId,
          ),
          eq(
            openchairAppointmentParticipants.appointmentId,
            appointment.id,
          ),
          eq(openchairAppointmentParticipants.userId, viewer.userId),
        ),
      ),
    db
      .select({ userId: platformOperators.userId })
      .from(platformOperators)
      .where(
        and(
          eq(platformOperators.userId, viewer.userId),
          eq(platformOperators.role, "platform_owner"),
          eq(platformOperators.status, "active"),
        ),
      )
      .limit(1),
  ]);
  const relationships: AppointmentRelationships = {
    clinic:
      appointment.createdByUserId === viewer.userId ||
      participantRows.some((row) => row.relationship === "clinic"),
    nonprofit: participantRows.some(
      (row) => row.relationship === "nonprofit",
    ),
    sponsor: participantRows.some((row) => row.relationship === "sponsor"),
    operator: operatorRows.length > 0,
  };
  if (!Object.values(relationships).some(Boolean)) return null;

  return {
    subjectId: viewer.userId,
    workspaceId: viewer.workspaceId,
    permissions: permissionsForAppointmentRelationships(relationships),
    relationships,
    viewerRole: viewerRoleForAppointmentRelationships(relationships),
  };
}

export function permissionsForAppointmentRelationships(
  relationships: AppointmentRelationships,
): OpenChairAction[] {
  const permissions = new Set<OpenChairAction>(["appointment.read"]);
  if (relationships.clinic) {
    permissions.add("appointment.publish");
    permissions.add("appointment.cancel");
    permissions.add("appointment.complete");
  }
  if (relationships.nonprofit) {
    permissions.add("beneficiary.read");
    permissions.add("candidate.select");
  }
  if (relationships.sponsor) {
    permissions.add("funding.read");
    permissions.add("funding.approve");
    permissions.add("funding.pay");
  }
  if (relationships.operator) {
    permissions.add("outreach.start");
    permissions.add("outreach.monitor");
    permissions.add("outreach.control");
    permissions.add("payment.link.send");
    permissions.add("workflow.admin");
  }
  return [...permissions];
}

export function viewerRoleForAppointmentRelationships(
  relationships: AppointmentRelationships,
): ViewerRole {
  if (relationships.operator) return "operator";
  if (relationships.clinic) return "clinic";
  if (relationships.nonprofit) return "nonprofit";
  return "sponsor";
}
