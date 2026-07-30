import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

import { beneficiaryCanBeSelected } from "../lib/openchair/beneficiaries/eligibility.ts";
import {
  authorizeWorkflowFrontend,
} from "../lib/openchair/authorization/frontend-access.ts";
import {
  buildFixtureFrontendAccess,
  filterProjectionForFrontend,
} from "../lib/openchair/projections/access-policy.ts";
import {
  buildStagePresentations,
} from "../lib/openchair/projections/workflow-view.ts";
import {
  WorkflowTransitionError,
  applyWorkflowFact,
  assertExpectedWorkflowVersion,
  createInitialWorkflowState,
} from "../lib/openchair/workflow/state-machine.ts";

const APPOINTMENT_ID = "appt_11111111111111111111111111111111";
const WORKSPACE_ID = "wsp_11111111111111111111111111111111";
const AHMED_CANDIDATE_ID = "cand_22222222222222222222222222222222";
const JAMES_CANDIDATE_ID = "cand_33333333333333333333333333333333";

test("complete OpenChair fact sequence fills exactly one chair", () => {
  let state = createInitialWorkflowState({
    appointmentId: APPOINTMENT_ID,
    workspaceId: WORKSPACE_ID,
    now: "2026-07-30T12:00:00.000Z",
  });

  ({ state } = dispatch(state, { type: "appointment.published" }, 1));
  assert.equal(state.stage, "PATIENT_SELECTION");

  ({ state } = dispatch(state, { type: "candidates.approved" }, 2));
  assert.equal(state.stage, "FUNDING_APPROVAL");

  let transition = dispatch(state, { type: "funding.sponsor_paid" }, 3);
  state = transition.state;
  assert.equal(state.stage, "CALLING_PATIENTS");
  assert.equal(state.sponsorPaid, true);
  assert.deepEqual(
    transition.effects.map((effect) => effect.type),
    ["workflow.stage_changed", "workflow.outreach_requested"],
  );

  transition = dispatch(
    state,
    {
      type: "outreach.patient_accepted",
      candidateId: AHMED_CANDIDATE_ID,
    },
    4,
  );
  state = transition.state;
  assert.equal(state.stage, "PATIENT_ACCEPTED");
  assert.equal(state.reservedCandidateId, AHMED_CANDIDATE_ID);
  assert.deepEqual(
    transition.effects.map((effect) => effect.type),
    ["workflow.patient_reserved", "workflow.stage_changed"],
  );

  ({ state } = dispatch(
    state,
    { type: "funding.patient_checkout_created" },
    5,
  ));
  assert.equal(state.stage, "PAYMENT");

  transition = dispatch(state, { type: "funding.patient_paid" }, 6);
  state = transition.state;
  assert.equal(state.stage, "CHAIR_FILLED");
  assert.equal(state.patientPaid, true);
  assert.equal(state.version, 7);
  assert.deepEqual(
    transition.effects.map((effect) => effect.type),
    ["workflow.stage_changed", "workflow.chair_filled"],
  );
});

test("duplicates do not advance workflow version", () => {
  let state = createInitialWorkflowState({
    appointmentId: APPOINTMENT_ID,
    workspaceId: WORKSPACE_ID,
    now: "2026-07-30T12:00:00.000Z",
  });
  ({ state } = dispatch(state, { type: "appointment.published" }, 1));
  ({ state } = dispatch(state, { type: "candidates.approved" }, 2));
  const duplicate = dispatch(state, { type: "candidates.approved" }, 3);
  assert.equal(duplicate.changed, false);
  assert.equal(duplicate.state.version, 3);

  ({ state } = dispatch(state, { type: "funding.sponsor_paid" }, 4));
  const duplicatePayment = dispatch(
    state,
    { type: "funding.sponsor_paid" },
    5,
  );
  assert.equal(duplicatePayment.changed, false);
  assert.equal(duplicatePayment.state.version, 4);
});

test("a second patient cannot replace the workflow reservation", () => {
  let state = callingState();
  ({ state } = dispatch(
    state,
    {
      type: "outreach.patient_accepted",
      candidateId: AHMED_CANDIDATE_ID,
    },
    4,
  ));

  assert.throws(
    () =>
      dispatch(
        state,
        {
          type: "outreach.patient_accepted",
          candidateId: JAMES_CANDIDATE_ID,
        },
        5,
      ),
    (error) =>
      error instanceof WorkflowTransitionError &&
      error.code === "patient_already_reserved",
  );
});

test("patient payment cannot fill an unreserved or unfunded chair", () => {
  const state = callingState();
  assert.throws(
    () => dispatch(state, { type: "funding.patient_paid" }, 4),
    (error) =>
      error instanceof WorkflowTransitionError &&
      error.code === "invalid_workflow_transition",
  );
});

test("stale command versions and invalid backward transitions fail closed", () => {
  const state = callingState();
  assert.throws(
    () => assertExpectedWorkflowVersion(state, state.version - 1),
    (error) =>
      error instanceof WorkflowTransitionError &&
      error.code === "stale_workflow_version",
  );
  assert.throws(
    () =>
      dispatch(state, { type: "funding.patient_checkout_created" }, 4),
    (error) =>
      error instanceof WorkflowTransitionError &&
      error.code === "invalid_workflow_transition",
  );
});

test("candidate exhaustion records the explicit MVP terminal policy", () => {
  const state = callingState();
  const transition = dispatch(state, { type: "outreach.exhausted" }, 4);
  assert.equal(transition.state.stage, "EXPIRED");
  assert.equal(
    transition.state.terminalReason,
    "candidate_pool_exhausted",
  );
});

test("beneficiary eligibility requires verification, availability, and consent", () => {
  const beneficiary = {
    id: "bene_11111111111111111111111111111111",
    workspaceId: WORKSPACE_ID,
    firstName: "Maria",
    lastName: "Example",
    preferredLanguage: "es",
    generalDentalNeed: "General visit",
    availableToday: true,
    verificationStatus: "verified",
    status: "active",
    consent: {
      contact: true,
      aiVoiceCall: true,
      sms: false,
      clinicDataSharing: true,
    },
  };
  assert.equal(beneficiaryCanBeSelected(beneficiary), true);
  assert.equal(
    beneficiaryCanBeSelected({
      ...beneficiary,
      consent: { ...beneficiary.consent, aiVoiceCall: false },
    }),
    false,
  );
});

test("granular projections deny data and actions before serialization", () => {
  const sponsorAccess = buildFixtureFrontendAccess(
    "sponsor",
    "PATIENT_ACCEPTED",
  );
  assert.equal(sponsorAccess.data["funding.summary"].allowed, true);
  assert.equal(
    sponsorAccess.data["accepted-patient.identity"].allowed,
    false,
  );
  assert.equal(sponsorAccess.actions["funding.approve"].allowed, false);
  assert.equal(sponsorAccess.actions["payment.link.send"].allowed, false);

  const operatorAccess = buildFixtureFrontendAccess(
    "operator",
    "CALLING_PATIENTS",
  );
  assert.equal(operatorAccess.data["outreach.transcript"].allowed, true);
  assert.equal(operatorAccess.actions["outreach.control"].allowed, true);
  assert.equal(operatorAccess.actions["appointment.cancel"].allowed, false);

  const filtered = filterProjectionForFrontend({
    appointment: {
      appointmentId: APPOINTMENT_ID,
      clinicName: "Fixture Clinic",
      startsAt: "2026-07-30T15:00:00.000Z",
      durationMinutes: 60,
      treatmentType: "General visit",
      currency: "USD",
      pricing: {
        fullPrice: 12000,
        discountedPrice: 8000,
        sponsorAmount: 6000,
        patientAmount: 2000,
      },
      expiresAt: "2026-07-30T14:00:00.000Z",
    },
    activeStage: "PATIENT_ACCEPTED",
    stages: buildStagePresentations("PATIENT_ACCEPTED"),
    viewerRole: "sponsor",
    panelType: "PATIENT_ACCEPTED",
    panelData: {
      selectedCandidateCount: 3,
      currentCandidateName: "Ahmed",
      acceptedCandidateId: AHMED_CANDIDATE_ID,
      acceptedPatientName: "Ahmed",
      previousOutcomes: [
        { displayName: "Maria", outcome: "No answer" },
      ],
      payments: {
        sponsor: { amount: 6000, status: "paid" },
        patient: { amount: 2000, status: "waiting" },
      },
    },
    access: sponsorAccess,
    allowedActions: [],
    workflowVersion: 5,
    lastUpdatedAt: "2026-07-30T13:00:00.000Z",
  });
  assert.equal(filtered.panelData.acceptedCandidateId, undefined);
  assert.equal(filtered.panelData.acceptedPatientName, undefined);
  assert.equal(filtered.panelData.currentCandidateName, undefined);
  assert.equal(filtered.panelData.previousOutcomes, undefined);
  assert.equal(filtered.panelData.payments?.sponsor.status, "paid");

  const failed = buildStagePresentations("FAILED", "CALLING_PATIENTS");
  assert.equal(
    failed.find((item) => item.stage === "CALLING_PATIENTS")?.status,
    "failed",
  );
  assert.equal(
    failed.find((item) => item.stage === "PAYMENT")?.status,
    "future",
  );
});

test("effective permissions still require appointment relationships and disclosure stage", () => {
  const clinicBeforeConfirmation = authorizeWorkflowFrontend(
    {
      subjectId: "usr_clinic",
      workspaceId: WORKSPACE_ID,
      permissions: [
        "appointment.read",
        "appointment.cancel",
        "funding.approve",
        "outreach.control",
      ],
      relationships: {
        clinic: true,
        nonprofit: false,
        sponsor: false,
        operator: false,
      },
    },
    "PAYMENT",
  );
  assert.equal(
    clinicBeforeConfirmation.actions["appointment.cancel"].allowed,
    true,
  );
  assert.equal(
    clinicBeforeConfirmation.actions["funding.approve"].allowed,
    false,
  );
  assert.equal(
    clinicBeforeConfirmation.actions["outreach.control"].allowed,
    false,
  );
  assert.deepEqual(
    clinicBeforeConfirmation.data["accepted-patient.identity"],
    { allowed: false, reason: "disclosure_not_reached" },
  );

  const clinicAfterConfirmation = authorizeWorkflowFrontend(
    {
      subjectId: "usr_clinic",
      workspaceId: WORKSPACE_ID,
      permissions: ["appointment.read"],
      relationships: {
        clinic: true,
        nonprofit: false,
        sponsor: false,
        operator: false,
      },
    },
    "CHAIR_FILLED",
  );
  assert.equal(
    clinicAfterConfirmation.data["accepted-patient.identity"].allowed,
    true,
  );
  assert.equal(
    clinicAfterConfirmation.data["accepted-patient.contact"].allowed,
    true,
  );
});

test("fixture catalog, D1 migration, UI, and architecture docs stay aligned", async () => {
  const fixtureDirectory = new URL(
    "../fixtures/openchair/",
    import.meta.url,
  );
  const fixtureNames = (await readdir(fixtureDirectory))
    .filter((name) => name.endsWith(".json"))
    .sort();
  assert.deepEqual(fixtureNames, [
    "calling-connected.json",
    "calling-no-answer.json",
    "chair-filled.json",
    "funding-approval.json",
    "open-slot.json",
    "patient-accepted.json",
    "patient-selection.json",
    "payment-waiting.json",
    "workflow-expired.json",
    "workflow-failed.json",
  ]);

  const migrationNames = (await readdir(
    new URL("../drizzle/", import.meta.url),
  )).filter((name) => name.endsWith(".sql"));
  const migrations = await Promise.all(
    migrationNames.map((name) =>
      readFile(new URL(`../drizzle/${name}`, import.meta.url), "utf8"),
    ),
  );
  const openChairMigration = migrations.find((sql) =>
    sql.includes("openchair_workflows"),
  );
  assert.ok(openChairMigration);
  assert.match(openChairMigration, /openchair_command_receipts/);
  assert.match(openChairMigration, /openchair_outreach_attempts/);
  assert.match(openChairMigration, /workspace_id/);

  const [architecture, workflow, frontendAccess] = await Promise.all([
    readFile(
      new URL("../docs/openchair/architecture.md", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../docs/openchair/workflow-contract.md", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../docs/openchair/frontend-access.md", import.meta.url),
      "utf8",
    ),
  ]);
  assert.match(architecture, /modular monolith/i);
  assert.match(architecture, /workspaceId/);
  assert.match(workflow, /funding\.patient_checkout_created/);
  assert.match(workflow, /must not say the clinic received funds/i);
  assert.match(frontendAccess, /server-side projection filtering/i);
  assert.match(frontendAccess, /Role query parameters must not exist/i);
});

function callingState() {
  let state = createInitialWorkflowState({
    appointmentId: APPOINTMENT_ID,
    workspaceId: WORKSPACE_ID,
    now: "2026-07-30T12:00:00.000Z",
  });
  ({ state } = dispatch(state, { type: "appointment.published" }, 1));
  ({ state } = dispatch(state, { type: "candidates.approved" }, 2));
  ({ state } = dispatch(state, { type: "funding.sponsor_paid" }, 3));
  return state;
}

function dispatch(state, fact, sequence) {
  return applyWorkflowFact(state, {
    eventId: `evt_${String(sequence).padStart(32, "0")}`,
    correlationId: "cor_11111111111111111111111111111111",
    occurredAt: `2026-07-30T12:${String(sequence).padStart(2, "0")}:00.000Z`,
    fact,
  });
}
