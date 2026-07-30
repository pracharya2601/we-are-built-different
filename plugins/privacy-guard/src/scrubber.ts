import { DEFAULT_TEXT_DETECTORS } from "./detectors.ts";
import { PrivacyGuardError } from "./error.ts";
import { DEFAULT_KEY_RULES } from "./key-rules.ts";
import {
  PRIVACY_POLICY_VERSION,
  type PrivacyAction,
  type PrivacyCategory,
  type PrivacyFinding,
  type PrivacyKeyRule,
  type PrivacyMode,
  type PrivacyReport,
  type ScrubOptions,
  type ScrubResult,
  type TextDetector,
  type TextMatch,
} from "./types.ts";

const DEFAULT_MAX_DEPTH = 40;
const DEFAULT_MAX_FINDINGS = 1_000;

type SelectedMatch = TextMatch & {
  detector: string;
};

type ScrubContext = {
  detectors: readonly TextDetector[];
  findings: PrivacyFinding[];
  keyRules: readonly PrivacyKeyRule[];
  maxDepth: number;
  maxFindings: number;
  mode: PrivacyMode;
  seen: WeakSet<object>;
  tokenCounters: Map<PrivacyCategory, number>;
  tokens: Map<string, string>;
};

function emptyReport(): PrivacyReport {
  return {
    counts: {},
    findings: [],
    hadSensitiveData: false,
    policyVersion: PRIVACY_POLICY_VERSION,
    totalFindings: 0,
  };
}

function reportFrom(findings: readonly PrivacyFinding[]): PrivacyReport {
  const counts: Partial<Record<PrivacyCategory, number>> = {};
  for (const finding of findings) {
    counts[finding.category] = (counts[finding.category] ?? 0) + 1;
  }

  return {
    counts,
    findings: [...findings],
    hadSensitiveData: findings.length > 0,
    policyVersion: PRIVACY_POLICY_VERSION,
    totalFindings: findings.length,
  };
}

function throwGuardError(
  context: ScrubContext,
  code:
    | "BLOCKED_SENSITIVE_DATA"
    | "INVALID_DETECTOR"
    | "MAX_DEPTH_EXCEEDED"
    | "MAX_FINDINGS_EXCEEDED"
    | "UNSAFE_INPUT",
  message: string,
): never {
  throw new PrivacyGuardError(code, message, reportFrom(context.findings));
}

function addFinding(
  context: ScrubContext,
  finding: PrivacyFinding,
): void {
  if (context.findings.length >= context.maxFindings) {
    throwGuardError(
      context,
      "MAX_FINDINGS_EXCEEDED",
      "Privacy finding limit exceeded; the LLM request was not sent.",
    );
  }
  context.findings.push(finding);
}

function normalizedKey(key: string): string {
  return key.replace(/[^a-z0-9]/giu, "");
}

function regexMatches(pattern: RegExp, value: string): boolean {
  const flags = pattern.flags.replaceAll("g", "").replaceAll("y", "");
  return new RegExp(pattern.source, flags).test(value);
}

function keyRuleFor(
  context: ScrubContext,
  key: string,
): PrivacyKeyRule | undefined {
  const normalized = normalizedKey(key);
  return context.keyRules.find((rule) =>
    regexMatches(rule.pattern, normalized),
  );
}

function categoryLabel(category: PrivacyCategory): string {
  return category.replaceAll("-", "_").toUpperCase();
}

function tokenFor(
  context: ScrubContext,
  category: PrivacyCategory,
  rawValue?: string,
): string {
  if (context.mode === "redact") {
    return `[REDACTED_${categoryLabel(category)}]`;
  }

  const lookupKey =
    rawValue === undefined ? undefined : `${category}\u0000${rawValue}`;
  if (lookupKey !== undefined) {
    const existing = context.tokens.get(lookupKey);
    if (existing !== undefined) return existing;
  }

  const next = (context.tokenCounters.get(category) ?? 0) + 1;
  context.tokenCounters.set(category, next);
  const token = `[PII_${categoryLabel(category)}_${next}]`;
  if (lookupKey !== undefined) context.tokens.set(lookupKey, token);
  return token;
}

function actionFor(mode: PrivacyMode): PrivacyAction {
  if (mode === "block") return "blocked";
  if (mode === "redact") return "redacted";
  return "tokenized";
}

function protectWholeValue(
  context: ScrubContext,
  category: PrivacyCategory,
  detector: string,
  path: string,
  value: unknown,
): unknown {
  if (value === null || value === undefined) return value;

  addFinding(context, {
    action: actionFor(context.mode),
    category,
    detector,
    path,
  });

  if (context.mode === "block") {
    throwGuardError(
      context,
      "BLOCKED_SENSITIVE_DATA",
      "Sensitive data was detected; the LLM request was not sent.",
    );
  }

  const rawValue =
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
      ? String(value)
      : undefined;
  return tokenFor(context, category, rawValue);
}

function selectedMatches(
  context: ScrubContext,
  value: string,
): SelectedMatch[] {
  const candidates: SelectedMatch[] = [];

  for (const detector of context.detectors) {
    let detected: readonly TextMatch[];
    try {
      detected = detector.detect(value);
    } catch {
      throwGuardError(
        context,
        "INVALID_DETECTOR",
        "A privacy detector failed; the LLM request was not sent.",
      );
    }

    for (const match of detected) {
      if (
        !Number.isInteger(match.start) ||
        !Number.isInteger(match.end) ||
        match.start < 0 ||
        match.end <= match.start ||
        match.end > value.length
      ) {
        throwGuardError(
          context,
          "INVALID_DETECTOR",
          "A privacy detector returned an invalid range; the LLM request was not sent.",
        );
      }
      candidates.push({ ...match, detector: detector.name });
    }
  }

  candidates.sort(
    (left, right) =>
      left.start - right.start ||
      (right.priority ?? 0) - (left.priority ?? 0) ||
      right.end - right.start - (left.end - left.start),
  );

  const selected: SelectedMatch[] = [];
  for (const candidate of candidates) {
    const overlaps = selected.some(
      (match) =>
        candidate.start < match.end && candidate.end > match.start,
    );
    if (!overlaps) selected.push(candidate);
  }

  return selected.sort((left, right) => left.start - right.start);
}

function scrubString(
  context: ScrubContext,
  value: string,
  path: string,
): string {
  const matches = selectedMatches(context, value);
  if (matches.length === 0) return value;

  for (const match of matches) {
    addFinding(context, {
      action: actionFor(context.mode),
      category: match.category,
      detector: match.detector,
      path,
    });
  }

  if (context.mode === "block") {
    throwGuardError(
      context,
      "BLOCKED_SENSITIVE_DATA",
      "Sensitive data was detected; the LLM request was not sent.",
    );
  }

  let cursor = 0;
  let output = "";
  for (const match of matches) {
    output += value.slice(cursor, match.start);
    output += tokenFor(
      context,
      match.category,
      value.slice(match.start, match.end),
    );
    cursor = match.end;
  }
  output += value.slice(cursor);
  return output;
}

function isPlainObject(value: object): value is Record<string, unknown> {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function scrubValue(
  context: ScrubContext,
  value: unknown,
  path: string,
  depth: number,
): unknown {
  if (depth > context.maxDepth) {
    throwGuardError(
      context,
      "MAX_DEPTH_EXCEEDED",
      "Privacy scan depth exceeded; the LLM request was not sent.",
    );
  }

  if (typeof value === "string") return scrubString(context, value, path);
  if (
    value === null ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throwGuardError(
        context,
        "UNSAFE_INPUT",
        "Non-finite numbers cannot cross the LLM privacy boundary.",
      );
    }
    return value;
  }

  if (typeof value !== "object") {
    throwGuardError(
      context,
      "UNSAFE_INPUT",
      "Only JSON-compatible values may cross the LLM privacy boundary.",
    );
  }

  if (context.seen.has(value)) {
    throwGuardError(
      context,
      "UNSAFE_INPUT",
      "Cyclic input cannot cross the LLM privacy boundary.",
    );
  }
  context.seen.add(value);

  try {
    if (Array.isArray(value)) {
      const output: unknown[] = [];
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(
          value,
          String(index),
        );
        if (descriptor === undefined) {
          throwGuardError(
            context,
            "UNSAFE_INPUT",
            "Sparse arrays cannot cross the LLM privacy boundary.",
          );
        }
        if ("get" in descriptor || "set" in descriptor) {
          throwGuardError(
            context,
            "UNSAFE_INPUT",
            "Accessor properties cannot cross the LLM privacy boundary.",
          );
        }
        output.push(
          scrubValue(
            context,
            descriptor.value,
            `${path}[${index}]`,
            depth + 1,
          ),
        );
      }
      return output;
    }

    if (!isPlainObject(value)) {
      throwGuardError(
        context,
        "UNSAFE_INPUT",
        "Non-plain objects cannot cross the LLM privacy boundary.",
      );
    }

    const descriptors = Object.getOwnPropertyDescriptors(value);
    const symbolKeys = Object.getOwnPropertySymbols(value);
    if (symbolKeys.length > 0) {
      throwGuardError(
        context,
        "UNSAFE_INPUT",
        "Symbol properties cannot cross the LLM privacy boundary.",
      );
    }

    const output: Record<string, unknown> = {};
    const entries = Object.entries(descriptors);
    for (const [index, [key, descriptor]] of entries.entries()) {
      if (!descriptor.enumerable) continue;
      if ("get" in descriptor || "set" in descriptor) {
        throwGuardError(
          context,
          "UNSAFE_INPUT",
          "Accessor properties cannot cross the LLM privacy boundary.",
        );
      }

      const child = descriptor.value;
      const childPath = `${path}[field:${index}]`;
      const scrubbedKey = scrubString(
        context,
        key,
        `${childPath}[key]`,
      );
      const rule = keyRuleFor(context, key);

      if (rule?.action === "drop" && child !== null && child !== undefined) {
        addFinding(context, {
          action: context.mode === "block" ? "blocked" : "dropped",
          category: rule.category,
          detector: `key:${rule.name}`,
          path: childPath,
        });
        if (context.mode === "block") {
          throwGuardError(
            context,
            "BLOCKED_SENSITIVE_DATA",
            "Sensitive data was detected; the LLM request was not sent.",
          );
        }
        continue;
      }

      if (Object.hasOwn(output, scrubbedKey)) {
        throwGuardError(
          context,
          "UNSAFE_INPUT",
          "Sanitized object keys collided; the LLM request was not sent.",
        );
      }

      const scrubbedChild =
        rule?.action === "protect"
          ? protectWholeValue(
              context,
              rule.category,
              `key:${rule.name}`,
              childPath,
              child,
            )
          : scrubValue(context, child, childPath, depth + 1);
      Object.defineProperty(output, scrubbedKey, {
        configurable: true,
        enumerable: true,
        value: scrubbedChild,
        writable: true,
      });
    }
    return output;
  } finally {
    context.seen.delete(value);
  }
}

export function scrubForLlm<T>(
  value: T,
  options: ScrubOptions = {},
): ScrubResult<T> {
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  const maxFindings = options.maxFindings ?? DEFAULT_MAX_FINDINGS;

  if (
    !Number.isInteger(maxDepth) ||
    maxDepth < 0 ||
    !Number.isInteger(maxFindings) ||
    maxFindings < 1
  ) {
    throw new PrivacyGuardError(
      "UNSAFE_INPUT",
      "Privacy limits must be positive integers.",
      emptyReport(),
    );
  }

  const context: ScrubContext = {
    detectors: [...DEFAULT_TEXT_DETECTORS, ...(options.customDetectors ?? [])],
    findings: [],
    keyRules: [...DEFAULT_KEY_RULES, ...(options.keyRules ?? [])],
    maxDepth,
    maxFindings,
    mode: options.mode ?? "tokenize",
    seen: new WeakSet(),
    tokenCounters: new Map(),
    tokens: new Map(),
  };

  let scrubbed: unknown;
  try {
    scrubbed = scrubValue(context, value, "$", 0);
  } catch (error) {
    if (error instanceof PrivacyGuardError) throw error;
    throwGuardError(
      context,
      "UNSAFE_INPUT",
      "Input inspection failed; the LLM request was not sent.",
    );
  }
  return {
    report: reportFrom(context.findings),
    value: scrubbed as T,
  };
}
