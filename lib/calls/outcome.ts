import {
  CALL_OUTCOMES,
  type CallOutcome,
} from "./types.ts";

export function parseCallOutcome(message: Record<string, unknown>): {
  outcome: CallOutcome;
  recipientReached: boolean | null;
  appointmentConfirmed: boolean | null;
  followUpRequired: boolean | null;
  summary: string | null;
  selectedAvailability: string | null;
} {
  const structured = findStructuredResult(message);
  const appointmentConfirmed = readBoolean(
    structured,
    "appointmentConfirmed",
  );
  const doNotCall = readBoolean(structured, "doNotCall");
  const requestedOutcome =
    readString(structured, "outcome") ??
    readString(structured, "callOutcome");
  let outcome = normalizeOutcome(requestedOutcome);
  if (doNotCall === true) outcome = "do_not_call";
  if (appointmentConfirmed === true) outcome = "confirmed";
  if (!outcome) {
    outcome = outcomeFromEndedReason(
      readString(message, "endedReason") ?? "",
    );
  }

  return {
    outcome,
    recipientReached:
      readBoolean(structured, "recipientReached") ??
      (["confirmed", "declined", "reschedule_requested", "do_not_call"].includes(
        outcome,
      )
        ? true
        : null),
    appointmentConfirmed:
      appointmentConfirmed ?? (outcome === "confirmed" ? true : null),
    followUpRequired:
      readBoolean(structured, "followUpRequired") ??
      (["reschedule_requested", "unclear"].includes(outcome) ? true : null),
    summary: limitedString(readString(structured, "summary"), 1_000),
    selectedAvailability: limitedString(
      readString(structured, "selectedAvailability") ??
        readString(structured, "confirmedAvailability"),
      500,
    ),
  };
}

function findStructuredResult(
  message: Record<string, unknown>,
): Record<string, unknown> {
  const analysis = readRecord(message, "analysis");
  const artifact = readRecord(message, "artifact");
  for (const candidate of [
    readRecord(analysis, "structuredData"),
    readRecord(analysis, "structuredOutput"),
    readRecord(artifact, "structuredData"),
    readRecord(artifact, "structuredOutput"),
  ]) {
    if (Object.keys(candidate).length > 0) return candidate;
  }
  const outputs = artifact.structuredOutputs;
  if (Array.isArray(outputs)) {
    for (const item of outputs) {
      if (!isRecord(item)) continue;
      const result = readRecord(item, "result");
      if (Object.keys(result).length > 0) return result;
      if (Object.keys(item).length > 0) return item;
    }
  }
  return {};
}

function normalizeOutcome(value: string | null): CallOutcome | null {
  if (!value) return null;
  const normalized = value
    .trim()
    .toLowerCase()
    .replaceAll(/[\s-]+/gu, "_");
  return CALL_OUTCOMES.includes(normalized as CallOutcome)
    ? (normalized as CallOutcome)
    : null;
}

function outcomeFromEndedReason(reason: string): CallOutcome {
  const normalized = reason.toLowerCase();
  if (normalized.includes("no-answer") || normalized.includes("did-not-answer")) {
    return "no_answer";
  }
  if (normalized.includes("busy")) return "busy";
  if (normalized.includes("voicemail")) return "voicemail";
  if (normalized.includes("wrong-number")) return "wrong_number";
  if (
    normalized.includes("error") ||
    normalized.includes("failed") ||
    normalized.includes("provider")
  ) {
    return "technical_failure";
  }
  return "unclear";
}

function readRecord(
  value: Record<string, unknown>,
  key: string,
): Record<string, unknown> {
  const selected = value[key];
  return isRecord(selected) ? selected : {};
}

function readString(
  value: Record<string, unknown>,
  key: string,
): string | null {
  const selected = value[key];
  return typeof selected === "string" && selected.trim()
    ? selected.trim()
    : null;
}

function readBoolean(
  value: Record<string, unknown>,
  key: string,
): boolean | null {
  return typeof value[key] === "boolean" ? value[key] : null;
}

function limitedString(
  value: string | null,
  maximum: number,
): string | null {
  return value ? value.slice(0, maximum) : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
