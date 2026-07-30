import type {
  AppointmentId,
  BeneficiaryId,
  CandidateId,
  CorrelationId,
  WorkspaceId,
} from "./identifiers.ts";

export type CommandActor = {
  type: "user" | "service" | "system";
  id: string;
  workspaceId?: WorkspaceId;
};

export type CommandContext = {
  idempotencyKey: string;
  expectedWorkflowVersion: number;
  correlationId: CorrelationId;
  actor: CommandActor;
  requestedAt: string;
};

export type PublishAppointmentCommand = CommandContext & {
  type: "appointment.publish";
  appointmentId: AppointmentId;
};

export type ApproveCandidatesCommand = CommandContext & {
  type: "candidates.approve";
  appointmentId: AppointmentId;
  candidateIds: CandidateId[];
};

export type ReportPatientAcceptedCommand = CommandContext & {
  type: "outreach.report_patient_accepted";
  appointmentId: AppointmentId;
  candidateId: CandidateId;
  beneficiaryId: BeneficiaryId;
};

export type OpenChairCommand =
  | PublishAppointmentCommand
  | ApproveCandidatesCommand
  | ReportPatientAcceptedCommand;
