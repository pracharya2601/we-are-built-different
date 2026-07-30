import {
  JOURNEY_STAGES,
  STAGE_LABELS,
  type JourneyStage,
  type StagePresentation,
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
