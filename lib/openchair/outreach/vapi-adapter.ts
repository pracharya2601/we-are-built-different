import type {
  AppointmentId,
  CallAttemptId,
  CandidateId,
} from "../contracts/index.ts";

export type StartVapiCallInput = {
  appointmentId: AppointmentId;
  candidateId: CandidateId;
  callAttemptId: CallAttemptId;
  firstName: string;
  phoneNumber: string;
  preferredLanguage: string;
  appointmentTime: string;
  patientAmount: number;
  currency: string;
};

export interface VapiCallProvider {
  startCall(
    input: StartVapiCallInput,
  ): Promise<{ providerCallId: string; status: string }>;
}
