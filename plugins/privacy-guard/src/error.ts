import type { PrivacyReport } from "./types.ts";

export type PrivacyGuardErrorCode =
  | "BLOCKED_SENSITIVE_DATA"
  | "INVALID_DETECTOR"
  | "MAX_DEPTH_EXCEEDED"
  | "MAX_FINDINGS_EXCEEDED"
  | "UNSAFE_INPUT";

export class PrivacyGuardError extends Error {
  readonly code: PrivacyGuardErrorCode;
  readonly report: PrivacyReport;

  constructor(
    code: PrivacyGuardErrorCode,
    message: string,
    report: PrivacyReport,
  ) {
    super(message);
    this.name = "PrivacyGuardError";
    this.code = code;
    this.report = report;
  }
}
