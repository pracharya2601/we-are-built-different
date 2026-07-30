import assert from "node:assert/strict";
import test from "node:test";

import {
  OpenChairOutreachService,
} from "../lib/openchair/outreach/service.ts";
import { toOpenChairOutcome } from "../lib/openchair/outreach/outcome.ts";

const APPOINTMENT_ID = "oca_11111111111111111111111111111111";
const CORRELATION_ID = "cor_22222222222222222222222222222222";
const MARIA_ID = "occ_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const AHMED_ID = "occ_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const JAMES_ID = "occ_cccccccccccccccccccccccccccccccc";

test("generic call outcomes map to workflow-safe OpenChair outcomes", () => {
  assert.deepEqual(
    {
      confirmed: toOpenChairOutcome("confirmed"),
      declined: toOpenChairOutcome("declined"),
      doNotCall: toOpenChairOutcome("do_not_call"),
      noAnswer: toOpenChairOutcome("no_answer"),
      voicemail: toOpenChairOutcome("voicemail"),
      busy: toOpenChairOutcome("busy"),
      wrongNumber: toOpenChairOutcome("wrong_number"),
      technical: toOpenChairOutcome("technical_failure"),
      unclear: toOpenChairOutcome("unclear"),
      reschedule: toOpenChairOutcome("reschedule_requested"),
    },
    {
      confirmed: "ACCEPTED",
      declined: "DECLINED",
      doNotCall: "DECLINED",
      noAnswer: "NO_ANSWER",
      voicemail: "VOICEMAIL",
      busy: "BUSY",
      wrongNumber: "WRONG_NUMBER",
      technical: "CALL_FAILED",
      unclear: "HUMAN_REVIEW",
      reschedule: "HUMAN_REVIEW",
    },
  );
});

test("calls one candidate at a time and stops after Workflow reserves one", async () => {
  const harness = createHarness([MARIA_ID, AHMED_ID, JAMES_ID]);

  assert.equal(
    await harness.service.startOrAdvance(APPOINTMENT_ID, CORRELATION_ID),
    "dispatched",
  );
  assert.equal(
    await harness.service.startOrAdvance(APPOINTMENT_ID, CORRELATION_ID),
    "busy",
  );
  assert.deepEqual(harness.dispatchedCandidates, [MARIA_ID]);

  assert.equal(
    await harness.service.handleCallEnded("generic-attempt-1", "no_answer"),
    "advanced",
  );
  assert.deepEqual(harness.dispatchedCandidates, [MARIA_ID, AHMED_ID]);

  assert.equal(
    await harness.service.handleCallEnded("generic-attempt-2", "confirmed"),
    "awaiting_reservation",
  );
  assert.deepEqual(
    harness.facts.map((fact) => fact.type),
    [
      "outreach.call_no_answer",
      "outreach.patient_accepted",
    ],
  );
  assert.equal(harness.store.stopped, false);

  assert.equal(
    await harness.service.handlePatientReserved(
      APPOINTMENT_ID,
      AHMED_ID,
      CORRELATION_ID,
    ),
    "stopped",
  );
  assert.equal(
    await harness.service.startOrAdvance(APPOINTMENT_ID, CORRELATION_ID),
    "stopped",
  );
  assert.deepEqual(harness.dispatchedCandidates, [MARIA_ID, AHMED_ID]);
  assert.equal(harness.store.candidateState.get(JAMES_ID), "SKIPPED");
});

test("duplicate completion is ignored and exhaustion is emitted once", async () => {
  const harness = createHarness([MARIA_ID]);
  await harness.service.startOrAdvance(APPOINTMENT_ID, CORRELATION_ID);
  assert.equal(
    await harness.service.handleCallEnded("generic-attempt-1", "declined"),
    "advanced",
  );
  assert.equal(
    await harness.service.handleCallEnded("generic-attempt-1", "declined"),
    "duplicate",
  );
  assert.equal(
    harness.facts.filter((fact) => fact.type === "outreach.exhausted").length,
    1,
  );
});

test("dead-letter outcomes pause for operator and recovery is idempotent", async () => {
  const harness = createHarness([MARIA_ID, AHMED_ID]);
  await harness.service.startOrAdvance(APPOINTMENT_ID, CORRELATION_ID);

  assert.equal(
    await harness.service.handleDeadLetter(
      "generic-attempt-1",
      "Cloudflare queue delivery exhausted.",
    ),
    "review",
  );
  assert.equal(harness.store.review?.outcome, "CALL_FAILED");
  assert.deepEqual(harness.dispatchedCandidates, [MARIA_ID]);

  assert.equal(
    await harness.service.recover(
      APPOINTMENT_ID,
      "retry",
      CORRELATION_ID,
    ),
    "dispatched",
  );
  assert.equal(
    await harness.service.recover(
      APPOINTMENT_ID,
      "retry",
      CORRELATION_ID,
    ),
    "duplicate",
  );
  assert.deepEqual(harness.dispatchedCandidates, [MARIA_ID, MARIA_ID]);
});

function createHarness(candidateIds) {
  const store = new FakeStore(candidateIds);
  const dispatchedCandidates = [];
  let attemptNumber = 0;
  const facts = [];
  const service = new OpenChairOutreachService(
    store,
    {
      async dispatch(_appointmentId, candidate) {
        dispatchedCandidates.push(candidate.id);
        attemptNumber += 1;
        return {
          callJobId: `generic-job-${attemptNumber}`,
          callAttemptId: `generic-attempt-${attemptNumber}`,
        };
      },
    },
    {
      async publish(fact) {
        facts.push(fact);
      },
    },
  );
  return { service, store, facts, dispatchedCandidates };
}

class FakeStore {
  constructor(candidateIds) {
    this.candidates = candidateIds.map((id, index) => ({
      id,
      sequenceNumber: index + 1,
    }));
    this.candidateState = new Map(candidateIds.map((id) => [id, "QUEUED"]));
    this.current = null;
    this.attempts = new Map();
    this.completedAttempts = new Set();
    this.stopped = false;
    this.exhausted = false;
    this.review = null;
  }

  async claimNextCandidate() {
    if (this.stopped) return { status: "stopped" };
    if (this.current) return { status: "busy" };
    if (this.exhausted) return { status: "stopped" };
    const candidate = this.candidates.find(
      (item) => this.candidateState.get(item.id) === "QUEUED",
    );
    if (!candidate) {
      this.exhausted = true;
      return { status: "exhausted" };
    }
    this.current = candidate;
    this.candidateState.set(candidate.id, "CALLING");
    return { status: "claimed", candidate };
  }

  async attachCall(_appointmentId, candidateId, dispatch) {
    assert.equal(this.current?.id, candidateId);
    this.attempts.set(dispatch.callAttemptId, candidateId);
  }

  async finishCurrent(callAttemptId, outcome) {
    if (this.completedAttempts.has(callAttemptId)) {
      return { status: "duplicate" };
    }
    const candidateId = this.attempts.get(callAttemptId);
    assert.equal(candidateId, this.current?.id);
    this.completedAttempts.add(callAttemptId);
    if (outcome === "ACCEPTED") {
      this.candidateState.set(candidateId, "ACCEPTED");
    } else if (outcome === "DECLINED") {
      this.candidateState.set(candidateId, "DECLINED");
      this.current = null;
    } else if (
      ["NO_ANSWER", "VOICEMAIL", "BUSY", "WRONG_NUMBER"].includes(outcome)
    ) {
      this.candidateState.set(candidateId, "NO_ANSWER");
      this.current = null;
    }
    return {
      status: "finished",
      appointmentId: APPOINTMENT_ID,
      candidateId,
      correlationId: CORRELATION_ID,
    };
  }

  async markForOperatorReview(
    _appointmentId,
    candidateId,
    outcome,
    reason,
  ) {
    this.review = { candidateId, outcome, reason };
  }

  async markDeadLetter(callAttemptId, reason) {
    if (this.review) return "duplicate";
    const candidateId = this.attempts.get(callAttemptId);
    if (!candidateId) return "duplicate";
    this.review = { candidateId, outcome: "CALL_FAILED", reason };
    return "marked";
  }

  async stopAfterReservation(_appointmentId, candidateId) {
    if (this.stopped) return false;
    assert.equal(this.current?.id, candidateId);
    this.stopped = true;
    this.current = null;
    for (const [id, state] of this.candidateState) {
      if (state === "QUEUED") this.candidateState.set(id, "SKIPPED");
    }
    return true;
  }

  async recover(_appointmentId, action) {
    if (!this.review) return "duplicate";
    const candidateId = this.review.candidateId;
    this.review = null;
    this.current = null;
    this.candidateState.set(
      candidateId,
      action === "retry" ? "QUEUED" : "NO_ANSWER",
    );
    return "ready";
  }
}
