import type { CallOutcome } from "../../calls/index.ts";
import type { OutreachOutcome } from "./types.ts";

const OUTCOME_MAP: Record<CallOutcome, OutreachOutcome> = {
  confirmed: "ACCEPTED",
  declined: "DECLINED",
  reschedule_requested: "HUMAN_REVIEW",
  no_answer: "NO_ANSWER",
  busy: "BUSY",
  voicemail: "VOICEMAIL",
  wrong_number: "WRONG_NUMBER",
  do_not_call: "DECLINED",
  unclear: "HUMAN_REVIEW",
  technical_failure: "CALL_FAILED",
};

export function toOpenChairOutcome(outcome: CallOutcome): OutreachOutcome {
  return OUTCOME_MAP[outcome];
}

export function outcomeAdvancesCandidate(outcome: OutreachOutcome): boolean {
  return [
    "DECLINED",
    "NO_ANSWER",
    "VOICEMAIL",
    "BUSY",
    "WRONG_NUMBER",
  ].includes(outcome);
}
