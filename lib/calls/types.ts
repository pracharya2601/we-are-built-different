export const CALL_OUTCOMES = [
  "confirmed",
  "declined",
  "reschedule_requested",
  "no_answer",
  "busy",
  "voicemail",
  "wrong_number",
  "do_not_call",
  "unclear",
  "technical_failure",
] as const;

export type CallOutcome = (typeof CALL_OUTCOMES)[number];

export type CallRecipientData = {
  name: string;
  phoneNumber: string;
  dentalAvailability: string;
  approvedContext: string;
  timezone: string;
  consentConfirmed: true;
};

export type CallResultData = {
  summary: string | null;
  selectedAvailability: string | null;
};

/** Attempt states where the provider still has the call in hand. */
export const ACTIVE_CALL_ATTEMPT_STATUSES = [
  "queued",
  "dispatching",
  "provider_queued",
  "ringing",
  "in_progress",
] as const;

export type ActiveCallAttemptStatus =
  (typeof ACTIVE_CALL_ATTEMPT_STATUSES)[number];

export type CallTranscriptSpeaker = "agent" | "recipient";

export type CallTranscriptLine = {
  speaker: CallTranscriptSpeaker;
  text: string;
  spokenAt: Date;
};

export type CallQueueMessage = {
  version: 1;
  jobId: string;
  attemptId: string;
};

export interface CallQueue {
  send(
    message: CallQueueMessage,
    options?: { delaySeconds?: number },
  ): Promise<unknown>;
}

export type VapiCallConfiguration = {
  apiKey: string;
  assistantId: string;
  phoneNumberId: string;
  apiBaseUrl: string;
};
