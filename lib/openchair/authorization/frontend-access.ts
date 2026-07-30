import {
  OPENCHAIR_ACTIONS,
  type FrontendDataGrant,
  type OpenChairAction,
  type WorkflowFrontendAccess,
  type WorkflowStage,
} from "../contracts/index.ts";
import { buildFrontendAccess } from "../projections/access-policy.ts";

export type AppointmentRelationships = {
  clinic: boolean;
  nonprofit: boolean;
  sponsor: boolean;
  operator: boolean;
};

export type OpenChairAuthorizationContext = {
  subjectId: string;
  workspaceId: string;
  permissions: readonly OpenChairAction[];
  relationships: AppointmentRelationships;
};

export function authorizeWorkflowFrontend(
  context: OpenChairAuthorizationContext,
  stage: WorkflowStage,
): WorkflowFrontendAccess {
  const permissions = new Set(context.permissions);
  const data = new Set<FrontendDataGrant>();

  if (permissions.has("appointment.read")) {
    data.add("appointment.summary");
    data.add("workflow.journey");
    data.add("workflow.failure-detail");
  }

  if (
    context.relationships.nonprofit &&
    (permissions.has("beneficiary.read") ||
      permissions.has("candidate.select"))
  ) {
    data.add("beneficiary.list");
    data.add("candidate.order");
    data.add("candidate.outcomes");
    data.add("funding.summary");
    data.add("payment.status");
  }

  if (
    context.relationships.sponsor &&
    permissions.has("funding.read")
  ) {
    data.add("funding.summary");
    data.add("payment.status");
  }

  if (context.relationships.clinic && permissions.has("appointment.read")) {
    data.add("funding.summary");
    data.add("payment.status");
  }

  if (
    context.relationships.operator &&
    permissions.has("outreach.monitor")
  ) {
    data.add("candidate.outcomes");
    data.add("funding.summary");
    data.add("outreach.status");
    data.add("outreach.transcript");
    data.add("payment.status");
  }

  const acceptedPatientVisible =
    (context.relationships.operator &&
      permissions.has("outreach.monitor") &&
      stageReached(stage, "PATIENT_ACCEPTED")) ||
    (context.relationships.clinic &&
      permissions.has("appointment.read") &&
      stageReached(stage, "CHAIR_FILLED"));
  if (acceptedPatientVisible) {
    data.add("accepted-patient.identity");
    data.add("accepted-patient.contact");
  }

  const actionGrants = OPENCHAIR_ACTIONS.filter(
    (action) =>
      permissions.has(action) &&
      relationshipAllowsAction(context.relationships, action),
  );
  const access = buildFrontendAccess({
    stage,
    grantedData: [...data],
    grantedActions: actionGrants,
  });

  if (
    (context.relationships.clinic || context.relationships.operator) &&
    !acceptedPatientVisible
  ) {
    access.data["accepted-patient.identity"] = {
      allowed: false,
      reason: "disclosure_not_reached",
    };
    access.data["accepted-patient.contact"] = {
      allowed: false,
      reason: "disclosure_not_reached",
    };
  }
  return access;
}

function relationshipAllowsAction(
  relationships: AppointmentRelationships,
  action: OpenChairAction,
): boolean {
  if (action === "appointment.read") {
    return Object.values(relationships).some(Boolean);
  }
  if (action.startsWith("appointment.")) return relationships.clinic;
  if (
    action.startsWith("beneficiary.") ||
    action.startsWith("candidate.")
  ) {
    return relationships.nonprofit;
  }
  if (action === "payment.link.send") return relationships.operator;
  if (action.startsWith("funding.")) return relationships.sponsor;
  if (action.startsWith("outreach.")) return relationships.operator;
  if (action === "workflow.admin") return relationships.operator;
  return false;
}

const DISCLOSURE_PATH = [
  "OPEN_SLOT",
  "PATIENT_SELECTION",
  "FUNDING_APPROVAL",
  "CALLING_PATIENTS",
  "PATIENT_ACCEPTED",
  "PAYMENT",
  "CHAIR_FILLED",
  "COMPLETED",
] as const;

function stageReached(
  stage: WorkflowStage,
  required: (typeof DISCLOSURE_PATH)[number],
): boolean {
  const currentIndex = DISCLOSURE_PATH.indexOf(
    stage as (typeof DISCLOSURE_PATH)[number],
  );
  return currentIndex >= DISCLOSURE_PATH.indexOf(required);
}
