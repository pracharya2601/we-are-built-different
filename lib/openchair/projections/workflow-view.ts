import {
  JOURNEY_STAGES,
  STAGE_LABELS,
  type JourneyStage,
  type OpenChairAction,
  type StagePresentation,
  type ViewerRole,
  type WorkflowProjection,
  type WorkflowStage,
} from "../contracts/index.ts";

export function buildStagePresentations(
  activeStage: WorkflowStage,
  lastJourneyStage: JourneyStage = "OPEN_SLOT",
): StagePresentation[] {
  const terminal = ["EXPIRED", "CANCELED", "FAILED"].includes(activeStage);
  const completed = activeStage === "COMPLETED";
  const visibleStage = terminal ? lastJourneyStage : activeStage;
  const activeIndex = JOURNEY_STAGES.indexOf(
    visibleStage as (typeof JOURNEY_STAGES)[number],
  );

  return JOURNEY_STAGES.map((stage, index) => {
    let status: StagePresentation["status"];
    if (completed) {
      status = "completed";
    } else if (terminal && index === activeIndex) {
      status = activeStage === "FAILED" ? "failed" : "blocked";
    } else if (index < activeIndex) {
      status = "completed";
    } else if (index === activeIndex) {
      status = "active";
    } else {
      status = "future";
    }
    return { stage, label: STAGE_LABELS[stage], status };
  });
}

export function allowedActionsFor(
  viewerRole: ViewerRole,
  stage: WorkflowStage,
): OpenChairAction[] {
  const actions: OpenChairAction[] = ["appointment.read"];
  if (viewerRole === "clinic") {
    if (stage === "OPEN_SLOT") actions.push("appointment.publish");
    if (!["COMPLETED", "EXPIRED", "CANCELED", "FAILED"].includes(stage)) {
      actions.push("appointment.cancel");
    }
    if (stage === "CHAIR_FILLED") actions.push("appointment.complete");
  }
  if (viewerRole === "nonprofit") {
    if (stage === "PATIENT_SELECTION") actions.push("candidate.select");
    actions.push("beneficiary.read");
  }
  if (viewerRole === "sponsor") {
    actions.push("funding.read");
    if (stage === "FUNDING_APPROVAL") actions.push("funding.approve");
  }
  if (viewerRole === "operator") {
    actions.push("outreach.monitor");
    if (stage === "CALLING_PATIENTS") actions.push("outreach.control");
  }
  return actions;
}

export function withSafeProjectionActions(
  projection: WorkflowProjection,
): WorkflowProjection {
  return {
    ...projection,
    allowedActions: allowedActionsFor(
      projection.viewerRole,
      projection.activeStage,
    ),
  };
}
