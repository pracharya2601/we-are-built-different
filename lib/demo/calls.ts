import type { AppDatabase } from "../../db";
import {
  createCallJob,
  enqueueCallAttempt,
  getCallDataEncryptionKey,
  getCallQueue,
  getCallRuntimeEnvironment,
  getVapiCallConfiguration,
  listCallLogs,
  listCallTranscriptLines,
  protectCallRecipient,
  revealCallTranscriptText,
  type CallOutcome,
} from "../calls";
import {
  DEMO_APPOINTMENT,
  DEMO_PATIENT,
  getDemoRun,
  getOrCreateDemoRun,
} from "./state";

const DEMO_RECIPIENT = {
  name: DEMO_PATIENT.name,
  phoneNumber: DEMO_PATIENT.phoneNumber,
  dentalAvailability: "Today at 3:00 PM",
  approvedContext: `${DEMO_APPOINTMENT.clinicName} has a ${DEMO_APPOINTMENT.treatmentType.toLowerCase()} appointment available. Confirm whether Maria can attend and agrees to the $20 patient contribution. Do not collect payment information during the call.`,
  timezone: "America/St_Johns",
  consentConfirmed: true,
} as const;

type DemoCallStatus =
  | "idle"
  | "queued"
  | "ringing"
  | "in_progress"
  | "completed"
  | "failed"
  | "canceled";

export type DemoCallView = {
  jobId: string | null;
  attemptId: string | null;
  patientId: typeof DEMO_PATIENT.id;
  status: DemoCallStatus;
  outcome: CallOutcome | null;
  durationSeconds: number | null;
  transcript: Array<{
    speaker: "agent" | "recipient";
    text: string;
    spokenAt: string;
  }>;
};

export class DemoCallError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: 400 | 409,
  ) {
    super(message);
    this.name = "DemoCallError";
  }
}

export async function queueDemoPatientCall(
  db: AppDatabase,
  input: {
    workspaceId: string;
    userId: string;
    patientId: unknown;
  },
): Promise<DemoCallView> {
  if (input.patientId !== DEMO_PATIENT.id) {
    throw new DemoCallError(
      "invalid_demo_patient",
      "The demo call can only be placed to the selected consented patient.",
      400,
    );
  }

  await getOrCreateDemoRun(db, {
    workspaceId: input.workspaceId,
    userId: input.userId,
  });
  const existing = await getDemoRun(db, input.workspaceId);
  if (existing?.callJobId) {
    throw new DemoCallError(
      "demo_call_already_started",
      "This demo workflow already has a call.",
      409,
    );
  }

  const environment = getCallRuntimeEnvironment();
  const encryptionKey = getCallDataEncryptionKey(environment);
  const queue = getCallQueue(environment);
  // Fail before persisting anything when provider identifiers are unavailable.
  void getVapiCallConfiguration(environment);

  const recipientDataCiphertext = await protectCallRecipient(
    DEMO_RECIPIENT,
    encryptionKey,
  );
  const created = await createCallJob(db, {
    workspaceId: input.workspaceId,
    createdByUserId: input.userId,
    recipientDataCiphertext,
    recipientPhoneLast4: DEMO_RECIPIENT.phoneNumber.slice(-4),
    // The demo has one consented recipient and must never auto-redial.
    maxAttempts: 1,
  });
  const queued = await enqueueCallAttempt(db, queue, {
    version: 1,
    jobId: created.job.id,
    attemptId: created.attempt.id,
  });
  if (!queued) {
    throw new Error("The demo call attempt could not be queued.");
  }

  return {
    jobId: created.job.id,
    attemptId: created.attempt.id,
    patientId: DEMO_PATIENT.id,
    status: "queued",
    outcome: null,
    durationSeconds: null,
    transcript: [],
  };
}

export async function getDemoCallView(
  db: AppDatabase,
  workspaceId: string,
  now = new Date(),
): Promise<DemoCallView> {
  const run = await getDemoRun(db, workspaceId);
  if (!run?.callJobId) return emptyCallView();

  const logs = await listCallLogs(db, 100);
  const selected = logs.find(({ job }) => job.id === run.callJobId);
  if (!selected) return emptyCallView();

  const attempt =
    selected.attempts.find((item) =>
      ["queued", "dispatching", "provider_queued", "ringing", "in_progress"].includes(
        item.status,
      ),
    ) ?? selected.attempts.at(-1);
  if (!attempt) return emptyCallView();

  const encryptionKey = getCallDataEncryptionKey(getCallRuntimeEnvironment());
  const transcriptRows = await listCallTranscriptLines(db, [attempt.id]);
  const transcript = (
    await Promise.all(
      transcriptRows.map(async (line) => ({
        speaker: line.speaker,
        text: await revealCallTranscriptText(
          line.textCiphertext,
          encryptionKey,
        ),
        spokenAt: line.spokenAt.toISOString(),
      })),
    )
  ).filter(
    (line): line is {
      speaker: "agent" | "recipient";
      text: string;
      spokenAt: string;
    } => Boolean(line.text),
  );

  return {
    jobId: selected.job.id,
    attemptId: attempt.id,
    patientId: DEMO_PATIENT.id,
    status: normalizeStatus(attempt.status),
    outcome: attempt.outcome ?? selected.job.outcome,
    durationSeconds: durationSeconds(
      attempt.startedAt,
      attempt.endedAt,
      now,
    ),
    transcript,
  };
}

export function demoStageForCall(
  call: Pick<DemoCallView, "status" | "outcome">,
): "calling" | "accepted" | null {
  if (call.outcome === "confirmed") return "accepted";
  if (["queued", "ringing", "in_progress"].includes(call.status)) {
    return "calling";
  }
  return null;
}

function emptyCallView(): DemoCallView {
  return {
    jobId: null,
    attemptId: null,
    patientId: DEMO_PATIENT.id,
    status: "idle",
    outcome: null,
    durationSeconds: null,
    transcript: [],
  };
}

function normalizeStatus(status: string): DemoCallStatus {
  if (["scheduled", "queued", "dispatching", "provider_queued"].includes(status)) {
    return "queued";
  }
  if (status === "ringing") return "ringing";
  if (status === "in_progress") return "in_progress";
  if (status === "ended") return "completed";
  if (status === "canceled") return "canceled";
  return "failed";
}

function durationSeconds(
  startedAt: Date | null,
  endedAt: Date | null,
  now: Date,
): number | null {
  if (!startedAt) return null;
  return Math.max(
    0,
    Math.floor(((endedAt ?? now).getTime() - startedAt.getTime()) / 1_000),
  );
}
