import {
  and,
  asc,
  desc,
  eq,
  isNotNull,
} from "drizzle-orm";

import type { AppDatabase } from "../../../db/index.ts";
import {
  openchairAppointments,
  openchairBeneficiaries,
  openchairCandidates,
  openchairFundingRequests,
  openchairOutreachAttempts,
  openchairOutreachRuns,
  openchairPayments,
  openchairWorkflowHistory,
  openchairWorkflows,
} from "../../../db/schema.ts";
import {
  authorizeWorkflowFrontend,
} from "../authorization/frontend-access.ts";
import {
  resolveLiveOpenChairContextForAppointment,
  type LiveWorkflowViewer,
} from "../authorization/live-context.ts";
import {
  JOURNEY_STAGES,
  type JourneyStage,
  type PaymentPresentation,
  type WorkflowPanelData,
  type WorkflowProjection,
} from "../contracts/index.ts";
import { filterProjectionForFrontend } from "./access-policy.ts";
import { buildStagePresentations } from "./workflow-view.ts";

export async function loadLiveWorkflowProjection(
  db: AppDatabase,
  viewer: LiveWorkflowViewer,
  appointmentId: string,
): Promise<WorkflowProjection | null> {
  const [record] = await db
    .select({
      appointmentId: openchairAppointments.id,
      clinicName: openchairAppointments.clinicName,
      startsAt: openchairAppointments.startsAt,
      durationMinutes: openchairAppointments.durationMinutes,
      treatmentType: openchairAppointments.treatmentType,
      currency: openchairAppointments.currency,
      fullPrice: openchairAppointments.fullPrice,
      discountedPrice: openchairAppointments.discountedPrice,
      sponsorAmount: openchairAppointments.sponsorAmount,
      patientAmount: openchairAppointments.patientAmount,
      expiresAt: openchairAppointments.expiresAt,
      createdByUserId: openchairAppointments.createdByUserId,
      activeStage: openchairWorkflows.stage,
      workflowVersion: openchairWorkflows.version,
      reservedCandidateId: openchairWorkflows.reservedCandidateId,
      terminalReason: openchairWorkflows.terminalReason,
      lastUpdatedAt: openchairWorkflows.updatedAt,
    })
    .from(openchairAppointments)
    .innerJoin(
      openchairWorkflows,
      and(
        eq(openchairWorkflows.appointmentId, openchairAppointments.id),
        eq(openchairWorkflows.workspaceId, openchairAppointments.workspaceId),
      ),
    )
    .where(
      and(
        eq(openchairAppointments.workspaceId, viewer.workspaceId),
        eq(openchairAppointments.id, appointmentId),
      ),
    )
    .limit(1);
  if (!record) return null;

  const context = await resolveLiveOpenChairContextForAppointment(
    db,
    viewer,
    {
      id: record.appointmentId,
      createdByUserId: record.createdByUserId,
    },
  );
  if (!context) return null;

  const access = authorizeWorkflowFrontend(context, record.activeStage);
  const panelData = await loadAllowedPanelData(
    db,
    viewer.workspaceId,
    record,
    access,
  );
  const lastJourneyStage = await loadLastJourneyStage(
    db,
    viewer.workspaceId,
    record.appointmentId,
    record.activeStage,
  );
  const panelType = JOURNEY_STAGES.includes(
    record.activeStage as JourneyStage,
  )
    ? (record.activeStage as JourneyStage)
    : "TERMINAL";

  return filterProjectionForFrontend({
    appointment: {
      appointmentId: record.appointmentId,
      clinicName: record.clinicName,
      startsAt: record.startsAt.toISOString(),
      durationMinutes: record.durationMinutes,
      treatmentType: record.treatmentType,
      currency: record.currency,
      pricing: {
        fullPrice: record.fullPrice,
        discountedPrice: record.discountedPrice,
        sponsorAmount: record.sponsorAmount,
        patientAmount: record.patientAmount,
      },
      expiresAt: record.expiresAt.toISOString(),
    },
    activeStage: record.activeStage,
    stages: buildStagePresentations(
      record.activeStage,
      lastJourneyStage,
    ),
    viewerRole: context.viewerRole,
    panelType,
    panelData,
    access,
    allowedActions: [],
    workflowVersion: record.workflowVersion,
    lastUpdatedAt: record.lastUpdatedAt.toISOString(),
  });
}

type LiveWorkflowRecord = {
  appointmentId: string;
  sponsorAmount: number;
  patientAmount: number;
  activeStage: typeof openchairWorkflows.$inferSelect.stage;
  reservedCandidateId: string | null;
  terminalReason: string | null;
};

async function loadAllowedPanelData(
  db: AppDatabase,
  workspaceId: string,
  record: LiveWorkflowRecord,
  access: WorkflowProjection["access"],
): Promise<WorkflowPanelData> {
  const panelData: WorkflowPanelData = {};

  if (
    access.data["beneficiary.list"].allowed ||
    access.data["candidate.order"].allowed
  ) {
    const candidates = await db
      .select({
        candidateId: openchairCandidates.id,
        firstName: openchairBeneficiaries.firstName,
        lastName: openchairBeneficiaries.lastName,
      })
      .from(openchairCandidates)
      .innerJoin(
        openchairBeneficiaries,
        and(
          eq(openchairBeneficiaries.id, openchairCandidates.beneficiaryId),
          eq(openchairBeneficiaries.workspaceId, workspaceId),
        ),
      )
      .where(
        and(
          eq(openchairCandidates.workspaceId, workspaceId),
          eq(openchairCandidates.appointmentId, record.appointmentId),
        ),
      )
      .orderBy(asc(openchairCandidates.sequenceNumber));
    panelData.selectedCandidateCount = candidates.length;
    panelData.candidateOptions = candidates.map((candidate) => ({
      candidateId: candidate.candidateId,
      displayName: displayName(candidate),
    }));
  }

  if (access.data["outreach.status"].allowed) {
    const [current] = await db
      .select({
        firstName: openchairBeneficiaries.firstName,
        lastName: openchairBeneficiaries.lastName,
      })
      .from(openchairOutreachRuns)
      .innerJoin(
        openchairCandidates,
        and(
          eq(openchairCandidates.id, openchairOutreachRuns.currentCandidateId),
          eq(openchairCandidates.workspaceId, workspaceId),
          eq(openchairCandidates.appointmentId, record.appointmentId),
        ),
      )
      .innerJoin(
        openchairBeneficiaries,
        and(
          eq(openchairBeneficiaries.id, openchairCandidates.beneficiaryId),
          eq(openchairBeneficiaries.workspaceId, workspaceId),
        ),
      )
      .where(
        and(
          eq(openchairOutreachRuns.workspaceId, workspaceId),
          eq(openchairOutreachRuns.appointmentId, record.appointmentId),
        ),
      )
      .limit(1);
    if (current) {
      panelData.currentCandidateName = displayName(current);
    }
  }

  if (access.data["candidate.outcomes"].allowed) {
    const outcomes = await db
      .select({
        firstName: openchairBeneficiaries.firstName,
        lastName: openchairBeneficiaries.lastName,
        outcome: openchairOutreachAttempts.outcome,
      })
      .from(openchairOutreachAttempts)
      .innerJoin(
        openchairCandidates,
        and(
          eq(openchairCandidates.id, openchairOutreachAttempts.candidateId),
          eq(openchairCandidates.workspaceId, workspaceId),
          eq(openchairCandidates.appointmentId, record.appointmentId),
        ),
      )
      .innerJoin(
        openchairBeneficiaries,
        and(
          eq(openchairBeneficiaries.id, openchairCandidates.beneficiaryId),
          eq(openchairBeneficiaries.workspaceId, workspaceId),
        ),
      )
      .where(
        and(
          eq(openchairOutreachAttempts.workspaceId, workspaceId),
          eq(
            openchairOutreachAttempts.appointmentId,
            record.appointmentId,
          ),
          isNotNull(openchairOutreachAttempts.outcome),
        ),
      )
      .orderBy(asc(openchairOutreachAttempts.attemptNumber));
    panelData.previousOutcomes = outcomes.map((outcome) => ({
      displayName: displayName(outcome),
      outcome: presentOutcome(outcome.outcome ?? "HUMAN_REVIEW"),
    }));
  }

  if (
    record.reservedCandidateId &&
    access.data["accepted-patient.identity"].allowed
  ) {
    const [accepted] = await db
      .select({
        candidateId: openchairCandidates.id,
        firstName: openchairBeneficiaries.firstName,
        lastName: openchairBeneficiaries.lastName,
      })
      .from(openchairCandidates)
      .innerJoin(
        openchairBeneficiaries,
        and(
          eq(openchairBeneficiaries.id, openchairCandidates.beneficiaryId),
          eq(openchairBeneficiaries.workspaceId, workspaceId),
        ),
      )
      .where(
        and(
          eq(openchairCandidates.workspaceId, workspaceId),
          eq(openchairCandidates.appointmentId, record.appointmentId),
          eq(openchairCandidates.id, record.reservedCandidateId),
        ),
      )
      .limit(1);
    if (accepted) {
      panelData.acceptedCandidateId = accepted.candidateId;
      panelData.acceptedPatientName = displayName(accepted);
    }
  }

  if (access.data["payment.status"].allowed) {
    const [payments, fundingRequests] = await Promise.all([
      db
        .select({
          payerType: openchairPayments.payerType,
          status: openchairPayments.status,
        })
        .from(openchairPayments)
        .where(
          and(
            eq(openchairPayments.workspaceId, workspaceId),
            eq(openchairPayments.appointmentId, record.appointmentId),
          ),
        ),
      db
        .select({ id: openchairFundingRequests.id })
        .from(openchairFundingRequests)
        .where(
          and(
            eq(openchairFundingRequests.workspaceId, workspaceId),
            eq(
              openchairFundingRequests.appointmentId,
              record.appointmentId,
            ),
          ),
        )
        .limit(1),
    ]);
    panelData.fundingApproved = fundingRequests.length > 0;
    panelData.payments = {
      sponsor: {
        amount: record.sponsorAmount,
        status: paymentStatus(
          payments.find((payment) => payment.payerType === "sponsor")?.status,
        ),
      },
      patient: {
        amount: record.patientAmount,
        status: paymentStatus(
          payments.find((payment) => payment.payerType === "patient")?.status,
        ),
      },
    };
  }

  if (
    access.data["workflow.failure-detail"].allowed &&
    record.terminalReason
  ) {
    panelData.blockedReason = presentOutcome(record.terminalReason);
  }
  return panelData;
}

async function loadLastJourneyStage(
  db: AppDatabase,
  workspaceId: string,
  appointmentId: string,
  activeStage: typeof openchairWorkflows.$inferSelect.stage,
): Promise<JourneyStage> {
  if (JOURNEY_STAGES.includes(activeStage as JourneyStage)) {
    return activeStage as JourneyStage;
  }
  const [history] = await db
    .select({ fromStage: openchairWorkflowHistory.fromStage })
    .from(openchairWorkflowHistory)
    .where(
      and(
        eq(openchairWorkflowHistory.workspaceId, workspaceId),
        eq(openchairWorkflowHistory.appointmentId, appointmentId),
      ),
    )
    .orderBy(desc(openchairWorkflowHistory.workflowVersion))
    .limit(1);
  return history &&
    JOURNEY_STAGES.includes(history.fromStage as JourneyStage)
    ? (history.fromStage as JourneyStage)
    : "OPEN_SLOT";
}

function paymentStatus(
  status: typeof openchairPayments.$inferSelect.status | undefined,
): PaymentPresentation["sponsor"]["status"] {
  if (status === "PAID") return "paid";
  if (status === "FAILED") return "failed";
  if (status === "REFUNDED") return "refunded";
  return "waiting";
}

function displayName(value: {
  firstName: string;
  lastName: string;
}): string {
  return `${value.firstName} ${value.lastName}`.trim();
}

function presentOutcome(value: string): string {
  const words = value.toLowerCase().replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}
