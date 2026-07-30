import type { CallOutcome } from "../../calls/index.ts";
import type {
  AppointmentId,
  CandidateId,
  CorrelationId,
} from "../contracts/index.ts";
import { toOpenChairOutcome } from "./outcome.ts";
import type { OutreachOutcome } from "./types.ts";

export type OutreachCandidate = {
  id: CandidateId;
  sequenceNumber: number;
};

export type OutreachDispatch = {
  callJobId: string;
  callAttemptId: string;
};

export type OutreachFact =
  | {
      type: "outreach.patient_accepted";
      appointmentId: AppointmentId;
      candidateId: CandidateId;
      correlationId: CorrelationId;
    }
  | {
      type: "outreach.patient_declined" | "outreach.call_no_answer";
      appointmentId: AppointmentId;
      candidateId: CandidateId;
      outcome: OutreachOutcome;
      correlationId: CorrelationId;
    }
  | {
      type: "outreach.exhausted";
      appointmentId: AppointmentId;
      correlationId: CorrelationId;
    }
  | {
      type: "outreach.stopped";
      appointmentId: AppointmentId;
      candidateId: CandidateId;
      correlationId: CorrelationId;
    };

export interface OpenChairOutreachStore {
  claimNextCandidate(
    appointmentId: AppointmentId,
  ): Promise<
    | { status: "claimed"; candidate: OutreachCandidate }
    | { status: "busy" }
    | { status: "exhausted" }
    | { status: "stopped" }
  >;
  attachCall(
    appointmentId: AppointmentId,
    candidateId: CandidateId,
    dispatch: OutreachDispatch,
  ): Promise<void>;
  finishCurrent(
    callAttemptId: string,
    outcome: OutreachOutcome,
  ): Promise<
    | {
        status: "finished";
        appointmentId: AppointmentId;
        candidateId: CandidateId;
        correlationId: CorrelationId;
      }
    | { status: "duplicate" }
  >;
  markForOperatorReview(
    appointmentId: AppointmentId,
    candidateId: CandidateId,
    outcome: "CALL_FAILED" | "HUMAN_REVIEW",
    reason: string,
  ): Promise<void>;
  markDeadLetter(
    callAttemptId: string,
    reason: string,
  ): Promise<"marked" | "duplicate">;
  stopAfterReservation(
    appointmentId: AppointmentId,
    candidateId: CandidateId,
  ): Promise<boolean>;
  recover(
    appointmentId: AppointmentId,
    action: "retry" | "skip",
  ): Promise<"ready" | "duplicate">;
}

export interface OpenChairCallDispatcher {
  dispatch(
    appointmentId: AppointmentId,
    candidate: OutreachCandidate,
  ): Promise<OutreachDispatch>;
}

export interface OutreachFactSink {
  publish(fact: OutreachFact): Promise<void>;
}

export class OpenChairOutreachService {
  private readonly store: OpenChairOutreachStore;
  private readonly calls: OpenChairCallDispatcher;
  private readonly facts: OutreachFactSink;

  constructor(
    store: OpenChairOutreachStore,
    calls: OpenChairCallDispatcher,
    facts: OutreachFactSink,
  ) {
    this.store = store;
    this.calls = calls;
    this.facts = facts;
  }

  async startOrAdvance(
    appointmentId: AppointmentId,
    correlationId: CorrelationId,
  ): Promise<"dispatched" | "busy" | "exhausted" | "stopped" | "review"> {
    const claim = await this.store.claimNextCandidate(appointmentId);
    if (claim.status === "busy" || claim.status === "stopped") {
      return claim.status;
    }
    if (claim.status === "exhausted") {
      await this.facts.publish({
        type: "outreach.exhausted",
        appointmentId,
        correlationId,
      });
      return "exhausted";
    }

    try {
      const dispatch = await this.calls.dispatch(
        appointmentId,
        claim.candidate,
      );
      await this.store.attachCall(
        appointmentId,
        claim.candidate.id,
        dispatch,
      );
      return "dispatched";
    } catch (error) {
      await this.store.markForOperatorReview(
        appointmentId,
        claim.candidate.id,
        "CALL_FAILED",
        error instanceof Error ? error.message : "Call dispatch failed.",
      );
      return "review";
    }
  }

  async handleCallEnded(
    callAttemptId: string,
    callOutcome: CallOutcome,
  ): Promise<"advanced" | "awaiting_reservation" | "duplicate" | "review"> {
    const outcome = toOpenChairOutcome(callOutcome);
    const completion = await this.store.finishCurrent(callAttemptId, outcome);
    if (completion.status === "duplicate") return "duplicate";

    const { appointmentId, candidateId, correlationId } = completion;
    if (outcome === "ACCEPTED") {
      await this.facts.publish({
        type: "outreach.patient_accepted",
        appointmentId,
        candidateId,
        correlationId,
      });
      return "awaiting_reservation";
    }
    if (outcome === "CALL_FAILED" || outcome === "HUMAN_REVIEW") {
      await this.store.markForOperatorReview(
        appointmentId,
        candidateId,
        outcome,
        `Call ended with ${callOutcome}.`,
      );
      return "review";
    }

    await this.facts.publish({
      type:
        outcome === "DECLINED"
          ? "outreach.patient_declined"
          : "outreach.call_no_answer",
      appointmentId,
      candidateId,
      outcome,
      correlationId,
    });
    await this.startOrAdvance(appointmentId, correlationId);
    return "advanced";
  }

  async handlePatientReserved(
    appointmentId: AppointmentId,
    candidateId: CandidateId,
    correlationId: CorrelationId,
  ): Promise<"stopped" | "duplicate"> {
    const stopped = await this.store.stopAfterReservation(
      appointmentId,
      candidateId,
    );
    if (!stopped) return "duplicate";
    await this.facts.publish({
      type: "outreach.stopped",
      appointmentId,
      candidateId,
      correlationId,
    });
    return "stopped";
  }

  async handleDeadLetter(
    callAttemptId: string,
    reason = "Call queue delivery was exhausted.",
  ): Promise<"review" | "duplicate"> {
    const result = await this.store.markDeadLetter(callAttemptId, reason);
    return result === "marked" ? "review" : "duplicate";
  }

  async recover(
    appointmentId: AppointmentId,
    action: "retry" | "skip",
    correlationId: CorrelationId,
  ): Promise<"dispatched" | "advanced" | "duplicate" | "exhausted"> {
    const recovered = await this.store.recover(appointmentId, action);
    if (recovered === "duplicate") return "duplicate";
    const result = await this.startOrAdvance(appointmentId, correlationId);
    if (result === "exhausted") return "exhausted";
    return action === "retry" ? "dispatched" : "advanced";
  }
}
