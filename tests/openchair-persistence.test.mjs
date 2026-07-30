import assert from "node:assert/strict";
import test from "node:test";

import { getTableName } from "drizzle-orm";

import {
  createAppointment,
  assertValidAppointment,
} from "../lib/openchair/appointments/d1-repository.ts";
import {
  claimCommandReceipt,
  hashCommandRequest,
} from "../lib/openchair/shared/command-receipts.ts";
import { OpenChairError } from "../lib/openchair/shared/errors.ts";
import { planWorkflowCommit } from "../lib/openchair/workflow/commit-plan.ts";
import { commitWorkflowFact } from "../lib/openchair/workflow/repository.ts";
import { WorkflowTransitionError } from "../lib/openchair/workflow/state-machine.ts";

const WORKSPACE_ID = "wsp_11111111111111111111111111111111";
const APPOINTMENT_ID = "appt_22222222222222222222222222222222";
const CANDIDATE_ID = "cand_33333333333333333333333333333333";
const OCCURRED_AT = "2026-07-30T12:00:00.000Z";

test("a committed fact plans one version bump, one history row, and one event per effect", () => {
  const plan = planWorkflowCommit({
    state: workflowState({ stage: "FUNDING_APPROVAL", version: 3 }),
    envelope: envelope({ type: "funding.sponsor_paid" }),
    actor: { type: "service", id: "stripe" },
    newId: sequentialIds(),
  });

  assert.equal(plan.changed, true);
  assert.equal(plan.workflow.version, 4);
  assert.equal(plan.workflow.stage, "CALLING_PATIENTS");
  assert.equal(plan.workflow.sponsorPaid, true);

  // The UPDATE must match the version the decision was made against, not the
  // one it produces, or a concurrent writer's change would be overwritten.
  assert.equal(plan.expectedVersion, 3);

  assert.equal(plan.history.workflowVersion, 4);
  assert.equal(plan.history.fromStage, "FUNDING_APPROVAL");
  assert.equal(plan.history.toStage, "CALLING_PATIENTS");
  assert.equal(plan.history.eventType, "funding.sponsor_paid");
  assert.equal(plan.history.eventId, "evt_fixture");
  assert.equal(plan.history.actorType, "service");

  assert.deepEqual(
    plan.outbox.map((event) => event.eventType),
    ["workflow.stage_changed", "workflow.outreach_requested"],
  );
  for (const event of plan.outbox) {
    assert.equal(event.aggregateId, APPOINTMENT_ID);
    assert.equal(event.payload.workspaceId, WORKSPACE_ID);
    assert.equal(event.payload.aggregateVersion, 4);
    assert.equal(event.payload.causationId, "evt_fixture");
  }
});

test("a duplicate fact plans no writes and consumes no version", () => {
  const plan = planWorkflowCommit({
    state: workflowState({
      stage: "CALLING_PATIENTS",
      version: 4,
      sponsorPaid: true,
    }),
    envelope: envelope({ type: "funding.sponsor_paid" }),
    actor: { type: "service", id: "stripe" },
    newId: sequentialIds(),
  });

  assert.equal(plan.changed, false);
  assert.equal(plan.transition.state.version, 4);
});

test("acceptance carries the reserved candidate into history and the outbox", () => {
  const plan = planWorkflowCommit({
    state: workflowState({
      stage: "CALLING_PATIENTS",
      version: 4,
      sponsorPaid: true,
    }),
    envelope: envelope({
      type: "outreach.patient_accepted",
      candidateId: CANDIDATE_ID,
    }),
    actor: { type: "service", id: "vapi" },
    newId: sequentialIds(),
  });

  assert.equal(plan.changed, true);
  assert.equal(plan.workflow.reservedCandidateId, CANDIDATE_ID);
  const reserved = plan.outbox.find(
    (event) => event.eventType === "workflow.patient_reserved",
  );
  assert.ok(reserved, "expected a reservation event");
  assert.equal(reserved.payload.candidateId, CANDIDATE_ID);
});

test("committing writes the workflow, history, effects, and caller rows in one batch", async () => {
  const { db, state } = fakeDb({
    selects: [[workflowRow({ stage: "FUNDING_APPROVAL", version: 3 })]],
  });
  const callerRow = { kind: "caller-owned" };

  const result = await commitWorkflowFact(db, {
    workspaceId: WORKSPACE_ID,
    appointmentId: APPOINTMENT_ID,
    actor: { type: "service", id: "stripe" },
    envelope: envelope({ type: "funding.sponsor_paid" }),
    extraOperations: [callerRow],
    newId: sequentialIds(),
  });

  assert.equal(result.changed, true);
  assert.equal(state.batches.length, 1);

  const [batch] = state.batches;
  assert.deepEqual(
    batch.map((operation) => operation.kind ?? "caller-owned"),
    ["update", "insert", "insert", "insert", "caller-owned"],
  );
  assert.equal(batch[0].table, "openchair_workflows");
  assert.equal(batch[0].values.version, 4);
  assert.equal(batch[1].table, "openchair_workflow_history");
  assert.equal(batch[2].table, "outbox_events");
  assert.equal(batch.at(-1), callerRow);
});

test("an unchanged fact writes the caller's rows and nothing else", async () => {
  const { db, state } = fakeDb({
    selects: [
      [workflowRow({ stage: "CALLING_PATIENTS", version: 4, sponsorPaid: true })],
    ],
  });
  const callerRow = { kind: "caller-owned" };

  const result = await commitWorkflowFact(db, {
    workspaceId: WORKSPACE_ID,
    appointmentId: APPOINTMENT_ID,
    actor: { type: "service", id: "stripe" },
    envelope: envelope({ type: "funding.sponsor_paid" }),
    extraOperations: [callerRow],
    newId: sequentialIds(),
  });

  assert.equal(result.changed, false);
  assert.deepEqual(state.batches, [[callerRow]]);
});

test("a stale expected version is rejected before anything is written", async () => {
  const { db, state } = fakeDb({
    selects: [[workflowRow({ stage: "FUNDING_APPROVAL", version: 5 })]],
  });

  await assert.rejects(
    commitWorkflowFact(db, {
      workspaceId: WORKSPACE_ID,
      appointmentId: APPOINTMENT_ID,
      actor: { type: "user", id: "usr_1" },
      expectedVersion: 3,
      envelope: envelope({ type: "funding.sponsor_paid" }),
      newId: sequentialIds(),
    }),
    (error) =>
      error instanceof WorkflowTransitionError &&
      error.code === "stale_workflow_version",
  );
  assert.equal(state.batches.length, 0);
});

test("committing against a missing workflow fails closed", async () => {
  const { db, state } = fakeDb({ selects: [[]] });

  await assert.rejects(
    commitWorkflowFact(db, {
      workspaceId: WORKSPACE_ID,
      appointmentId: APPOINTMENT_ID,
      actor: { type: "user", id: "usr_1" },
      envelope: envelope({ type: "appointment.published" }),
      newId: sequentialIds(),
    }),
    (error) =>
      error instanceof OpenChairError && error.code === "workflow_not_found",
  );
  assert.equal(state.batches.length, 0);
});

test("command request hashes ignore property order but not content", async () => {
  const [left, right, different] = await Promise.all([
    hashCommandRequest({ a: 1, b: { c: 2, d: 3 } }),
    hashCommandRequest({ b: { d: 3, c: 2 }, a: 1 }),
    hashCommandRequest({ a: 1, b: { c: 2, d: 4 } }),
  ]);
  assert.equal(left, right);
  assert.notEqual(left, different);
});

test("a completed receipt replays instead of reapplying the command", async () => {
  const { db } = fakeDb({
    insertReturning: [],
    selects: [
      [
        {
          id: "cmd_1",
          requestHash: "hash-a",
          status: "completed",
          resultVersion: 7,
        },
      ],
    ],
  });

  const claim = await claimCommandReceipt(db, receiptInput("hash-a"));
  assert.deepEqual(claim, {
    status: "replayed",
    receiptId: "cmd_1",
    resultVersion: 7,
  });
});

test("reusing an idempotency key for a different command is rejected", async () => {
  const { db } = fakeDb({
    insertReturning: [],
    selects: [
      [
        {
          id: "cmd_1",
          requestHash: "hash-a",
          status: "completed",
          resultVersion: 7,
        },
      ],
    ],
  });

  await assert.rejects(
    claimCommandReceipt(db, receiptInput("hash-b")),
    (error) =>
      error instanceof OpenChairError &&
      error.code === "idempotency_key_reused",
  );
});

test("creating an appointment creates its workflow in the same batch", async () => {
  const { db, state } = fakeDb();

  const appointment = await createAppointment(
    db,
    validAppointmentInput(),
    "usr_44444444444444444444444444444444",
  );

  assert.equal(state.batches.length, 1);
  const [appointmentInsert, workflowInsert] = state.batches[0];
  assert.equal(appointmentInsert.table, "openchair_appointments");
  assert.equal(workflowInsert.table, "openchair_workflows");
  assert.equal(appointmentInsert.values.status, "draft");
  assert.equal(workflowInsert.values.appointmentId, appointment.id);
  assert.equal(workflowInsert.values.stage, "OPEN_SLOT");
  assert.equal(workflowInsert.values.version, 1);
  assert.equal(workflowInsert.values.workspaceId, WORKSPACE_ID);
});

test("appointment amounts must balance and the cutoff must precede the visit", () => {
  assert.throws(
    () =>
      assertValidAppointment({
        ...validAppointmentInput(),
        sponsorAmount: 5000,
        patientAmount: 2000,
      }),
    (error) =>
      error instanceof OpenChairError && error.code === "invalid_appointment",
  );

  assert.throws(
    () =>
      assertValidAppointment({
        ...validAppointmentInput(),
        expiresAt: "2026-08-02T09:00:00.000Z",
        startsAt: "2026-08-01T09:00:00.000Z",
      }),
    (error) => error instanceof OpenChairError,
  );
});

function workflowState(overrides) {
  return {
    appointmentId: APPOINTMENT_ID,
    workspaceId: WORKSPACE_ID,
    stage: "OPEN_SLOT",
    version: 1,
    sponsorPaid: false,
    patientPaid: false,
    reservedCandidateId: null,
    terminalReason: null,
    updatedAt: OCCURRED_AT,
    ...overrides,
  };
}

function workflowRow(overrides) {
  return {
    ...workflowState(overrides),
    updatedAt: new Date(OCCURRED_AT),
  };
}

function envelope(fact) {
  return {
    eventId: "evt_fixture",
    correlationId: "cor_fixture",
    occurredAt: OCCURRED_AT,
    fact,
  };
}

function receiptInput(requestHash) {
  return {
    workspaceId: WORKSPACE_ID,
    appointmentId: APPOINTMENT_ID,
    commandType: "appointment.publish",
    idempotencyKey: "idem-1",
    requestHash,
    expectedVersion: 1,
    correlationId: "cor_fixture",
    actor: { type: "user", id: "usr_1" },
  };
}

function validAppointmentInput() {
  return {
    workspaceId: WORKSPACE_ID,
    clinicName: "Riverside Dental",
    startsAt: "2026-08-02T09:00:00.000Z",
    durationMinutes: 45,
    treatmentType: "cleaning",
    currency: "usd",
    fullPrice: 20000,
    discountedPrice: 8000,
    sponsorAmount: 6000,
    patientAmount: 2000,
    expiresAt: "2026-08-01T09:00:00.000Z",
  };
}

function sequentialIds() {
  let index = 0;
  return (prefix) => `${prefix}_${++index}`;
}

/**
 * A minimal stand-in for the Drizzle D1 surface these modules touch. Statements
 * become inspectable markers so a test can assert what a batch would write
 * without a live database.
 */
function fakeDb({ selects = [], insertReturning = [] } = {}) {
  const state = { batches: [], selects: [...selects] };
  const db = {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve(state.selects.shift() ?? []),
        }),
      }),
    }),
    insert: (table) => ({
      values: (values) => {
        const operation = {
          kind: "insert",
          table: getTableName(table),
          values,
        };
        return Object.assign(operation, {
          onConflictDoNothing: () => ({
            returning: () => Promise.resolve(insertReturning),
          }),
          onConflictDoUpdate: () => operation,
        });
      },
    }),
    update: (table) => ({
      set: (values) => ({
        where: () => ({ kind: "update", table: getTableName(table), values }),
      }),
    }),
    batch: (operations) => {
      state.batches.push(operations);
      return Promise.resolve([]);
    },
  };
  return { db, state };
}
