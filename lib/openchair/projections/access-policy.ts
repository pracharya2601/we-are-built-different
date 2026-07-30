import {
  FRONTEND_DATA_GRANTS,
  OPENCHAIR_ACTIONS,
  type AccessDecision,
  type FrontendDataGrant,
  type OpenChairAction,
  type ViewerRole,
  type WorkflowFrontendAccess,
  type WorkflowProjection,
  type WorkflowStage,
} from "../contracts/index.ts";

type FrontendAccessInput = {
  stage: WorkflowStage;
  grantedData: readonly FrontendDataGrant[];
  grantedActions: readonly OpenChairAction[];
};

export class OpenChairProjectionAccessError extends Error {
  constructor() {
    super("Appointment summary and workflow journey access are required.");
    this.name = "OpenChairProjectionAccessError";
  }
}

const ACTION_STAGES: Partial<
  Record<OpenChairAction, readonly WorkflowStage[]>
> = {
  "appointment.publish": ["OPEN_SLOT"],
  "appointment.complete": ["CHAIR_FILLED"],
  "candidate.select": ["PATIENT_SELECTION"],
  "funding.approve": ["FUNDING_APPROVAL"],
  "funding.pay": ["FUNDING_APPROVAL"],
  "payment.link.send": ["PATIENT_ACCEPTED", "PAYMENT"],
  "outreach.start": ["CALLING_PATIENTS"],
  "outreach.control": ["CALLING_PATIENTS"],
};

const TERMINAL_STAGES: readonly WorkflowStage[] = [
  "COMPLETED",
  "EXPIRED",
  "CANCELED",
  "FAILED",
];

export function buildFrontendAccess(
  input: FrontendAccessInput,
): WorkflowFrontendAccess {
  const grantedData = new Set(input.grantedData);
  const grantedActions = new Set(input.grantedActions);
  const data = Object.fromEntries(
    FRONTEND_DATA_GRANTS.map((grant) => [
      grant,
      decision(grantedData.has(grant), "not_granted"),
    ]),
  ) as Record<FrontendDataGrant, AccessDecision>;
  const actions = Object.fromEntries(
    OPENCHAIR_ACTIONS.map((action) => {
      if (!grantedActions.has(action)) {
        return [action, decision(false, "not_granted")];
      }
      const allowedStages = ACTION_STAGES[action];
      if (allowedStages && !allowedStages.includes(input.stage)) {
        return [action, decision(false, "stage_not_active")];
      }
      if (
        action === "appointment.cancel" &&
        TERMINAL_STAGES.includes(input.stage)
      ) {
        return [action, decision(false, "stage_not_active")];
      }
      return [action, decision(true, null)];
    }),
  ) as Record<OpenChairAction, AccessDecision>;
  return { data, actions };
}

export function buildFixtureFrontendAccess(
  viewerRole: ViewerRole,
  stage: WorkflowStage,
): WorkflowFrontendAccess {
  const data = new Set<FrontendDataGrant>([
    "appointment.summary",
    "workflow.journey",
    "workflow.failure-detail",
  ]);
  const actions = new Set<OpenChairAction>(["appointment.read"]);

  if (viewerRole === "clinic") {
    data.add("funding.summary");
    data.add("payment.status");
    actions.add("appointment.publish");
    actions.add("appointment.cancel");
    actions.add("appointment.complete");
    if (["CHAIR_FILLED", "COMPLETED"].includes(stage)) {
      data.add("accepted-patient.identity");
      data.add("accepted-patient.contact");
    }
  }

  if (viewerRole === "nonprofit") {
    data.add("beneficiary.list");
    data.add("candidate.order");
    data.add("candidate.outcomes");
    data.add("funding.summary");
    data.add("payment.status");
    actions.add("beneficiary.read");
    actions.add("candidate.select");
  }

  if (viewerRole === "sponsor") {
    data.add("funding.summary");
    data.add("payment.status");
    actions.add("funding.read");
    actions.add("funding.approve");
    actions.add("funding.pay");
  }

  if (viewerRole === "operator") {
    data.add("candidate.outcomes");
    data.add("funding.summary");
    data.add("outreach.status");
    data.add("outreach.transcript");
    data.add("payment.status");
    actions.add("outreach.start");
    actions.add("outreach.monitor");
    actions.add("outreach.control");
    actions.add("payment.link.send");
    if (
      ["PATIENT_ACCEPTED", "PAYMENT", "CHAIR_FILLED", "COMPLETED"].includes(
        stage,
      )
    ) {
      data.add("accepted-patient.identity");
      data.add("accepted-patient.contact");
    }
  }

  return buildFrontendAccess({
    stage,
    grantedData: [...data],
    grantedActions: [...actions],
  });
}

export function filterProjectionForFrontend(
  projection: WorkflowProjection,
): WorkflowProjection {
  if (
    !projection.access.data["appointment.summary"].allowed ||
    !projection.access.data["workflow.journey"].allowed
  ) {
    throw new OpenChairProjectionAccessError();
  }
  const can = (grant: FrontendDataGrant) =>
    projection.access.data[grant].allowed;
  const panelData = {
    ...projection.panelData,
    selectedCandidateCount:
      can("beneficiary.list") || can("candidate.order")
        ? projection.panelData.selectedCandidateCount
        : undefined,
    candidateOptions:
      can("beneficiary.list") || can("candidate.order")
        ? projection.panelData.candidateOptions
        : undefined,
    fundingApproved: can("funding.summary")
      ? projection.panelData.fundingApproved
      : undefined,
    currentCandidateName: can("outreach.status")
      ? projection.panelData.currentCandidateName
      : undefined,
    previousOutcomes: can("candidate.outcomes")
      ? projection.panelData.previousOutcomes
      : undefined,
    acceptedCandidateId: can("accepted-patient.identity")
      ? projection.panelData.acceptedCandidateId
      : undefined,
    acceptedPatientName: can("accepted-patient.identity")
      ? projection.panelData.acceptedPatientName
      : undefined,
    payments: can("payment.status")
      ? projection.panelData.payments
      : undefined,
    blockedReason: can("workflow.failure-detail")
      ? projection.panelData.blockedReason
      : undefined,
  };
  return {
    ...projection,
    appointment: {
      ...projection.appointment,
      pricing: can("funding.summary")
        ? projection.appointment.pricing
        : null,
    },
    panelData,
    allowedActions: OPENCHAIR_ACTIONS.filter(
      (action) => projection.access.actions[action].allowed,
    ),
  };
}

function decision(
  allowed: boolean,
  reason: AccessDecision["reason"],
): AccessDecision {
  return { allowed, reason: allowed ? null : reason };
}
