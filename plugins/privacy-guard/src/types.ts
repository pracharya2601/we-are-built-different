export const PRIVACY_POLICY_VERSION = "2026-07-30";

export type PrivacyMode = "tokenize" | "redact" | "block";

export type PrivacyCategory =
  | "account-identifier"
  | "credential"
  | "credit-card"
  | "custom"
  | "date-of-birth"
  | "email"
  | "government-identifier"
  | "ip-address"
  | "person-name"
  | "phone"
  | "postal-address";

export type PrivacyAction = "blocked" | "dropped" | "redacted" | "tokenized";

export type PrivacyFinding = {
  action: PrivacyAction;
  category: PrivacyCategory;
  detector: string;
  path: string;
};

export type PrivacyReport = {
  counts: Partial<Record<PrivacyCategory, number>>;
  findings: PrivacyFinding[];
  hadSensitiveData: boolean;
  policyVersion: string;
  totalFindings: number;
};

export type TextMatch = {
  category: PrivacyCategory;
  end: number;
  priority?: number;
  start: number;
};

export type TextDetector = {
  detect: (value: string) => readonly TextMatch[];
  name: string;
};

export type PrivacyKeyRule = {
  action: "drop" | "protect";
  category: PrivacyCategory;
  name: string;
  pattern: RegExp;
};

export type ScrubOptions = {
  customDetectors?: readonly TextDetector[];
  keyRules?: readonly PrivacyKeyRule[];
  maxDepth?: number;
  maxFindings?: number;
  mode?: PrivacyMode;
};

export type ScrubResult<T> = {
  report: PrivacyReport;
  value: T;
};

export type PrivacyAuditEvent =
  | {
      kind: "llm.request.blocked";
      report: PrivacyReport;
    }
  | {
      kind: "llm.request.sanitized";
      report: PrivacyReport;
    };

export type PrivacySafeGatewayOptions<Request, Response> = {
  audit?: (event: PrivacyAuditEvent) => Promise<void> | void;
  scrub?: ScrubOptions;
  transport: (request: Request) => Promise<Response>;
};
