import type { CallRecipientData } from "./types.ts";

export class CallValidationError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "CallValidationError";
    this.code = code;
  }
}

export function parseCallRequest(value: unknown): {
  recipient: CallRecipientData;
  maxAttempts: number;
} {
  if (!isRecord(value)) {
    throw new CallValidationError(
      "invalid_request",
      "Request body must be a JSON object.",
    );
  }

  const name = requiredText(value.name, "name", 2, 120);
  const phoneNumber = requiredText(
    value.phoneNumber,
    "phoneNumber",
    8,
    16,
  );
  if (!/^\+[1-9]\d{7,14}$/u.test(phoneNumber)) {
    throw new CallValidationError(
      "invalid_phone_number",
      "Phone number must use E.164 format, such as +14155550123.",
    );
  }
  const dentalAvailability = requiredText(
    value.dentalAvailability,
    "dentalAvailability",
    3,
    2_000,
  );
  const approvedContext = optionalText(
    value.approvedContext,
    "approvedContext",
    2_000,
  );
  const timezone = requiredText(value.timezone, "timezone", 3, 80);
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format();
  } catch {
    throw new CallValidationError(
      "invalid_timezone",
      "timezone must be a valid IANA time zone.",
    );
  }
  if (value.consentConfirmed !== true) {
    throw new CallValidationError(
      "consent_required",
      "Documented permission to place this automated call is required.",
    );
  }
  const maxAttempts = value.maxAttempts ?? 3;
  if (
    typeof maxAttempts !== "number" ||
    !Number.isInteger(maxAttempts) ||
    maxAttempts < 1 ||
    maxAttempts > 5
  ) {
    throw new CallValidationError(
      "invalid_max_attempts",
      "maxAttempts must be an integer from 1 through 5.",
    );
  }

  return {
    recipient: {
      name,
      phoneNumber,
      dentalAvailability,
      approvedContext,
      timezone,
      consentConfirmed: true,
    },
    maxAttempts,
  };
}

function requiredText(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
): string {
  if (typeof value !== "string") {
    throw new CallValidationError(
      `invalid_${field}`,
      `${field} must be text.`,
    );
  }
  const normalized = value.trim();
  if (normalized.length < minimum || normalized.length > maximum) {
    throw new CallValidationError(
      `invalid_${field}`,
      `${field} must contain ${minimum} to ${maximum} characters.`,
    );
  }
  return normalized;
}

function optionalText(
  value: unknown,
  field: string,
  maximum: number,
): string {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string" || value.trim().length > maximum) {
    throw new CallValidationError(
      `invalid_${field}`,
      `${field} must contain no more than ${maximum} characters.`,
    );
  }
  return value.trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
