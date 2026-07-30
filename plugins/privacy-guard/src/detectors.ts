import type {
  PrivacyCategory,
  TextDetector,
  TextMatch,
} from "./types.ts";

function regexDetector(
  name: string,
  category: PrivacyCategory,
  pattern: RegExp,
  priority = 10,
  accept: (match: string) => boolean = () => true,
): TextDetector {
  return {
    name,
    detect(value) {
      const flags = pattern.flags.includes("g")
        ? pattern.flags
        : `${pattern.flags}g`;
      const expression = new RegExp(pattern.source, flags);
      const matches: TextMatch[] = [];

      for (const match of value.matchAll(expression)) {
        const matchedValue = match[0];
        const start = match.index;
        if (
          start === undefined ||
          matchedValue.length === 0 ||
          !accept(matchedValue)
        ) {
          continue;
        }
        matches.push({
          category,
          end: start + matchedValue.length,
          priority,
          start,
        });
      }

      return matches;
    },
  };
}

function digitsOnly(value: string): string {
  return value.replace(/\D/gu, "");
}

function passesLuhn(value: string): boolean {
  const digits = digitsOnly(value);
  if (digits.length < 13 || digits.length > 19) return false;

  let sum = 0;
  let doubleDigit = false;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let digit = Number(digits[index]);
    if (doubleDigit) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    doubleDigit = !doubleDigit;
  }
  return sum % 10 === 0;
}

function isIpv4(value: string): boolean {
  const parts = value.split(".");
  return (
    parts.length === 4 &&
    parts.every((part) => {
      if (!/^\d{1,3}$/u.test(part)) return false;
      const number = Number(part);
      return number >= 0 && number <= 255;
    })
  );
}

export const DEFAULT_TEXT_DETECTORS: readonly TextDetector[] = [
  regexDetector(
    "api-secret",
    "credential",
    /\b(?:Bearer\s+[\w.+/=-]{12,}|(?:sk|pk)_(?:live|test)_[A-Za-z0-9]{12,}|sk-[A-Za-z0-9_-]{12,})\b/giu,
    100,
  ),
  regexDetector(
    "jwt",
    "credential",
    /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/gu,
    100,
  ),
  regexDetector(
    "email",
    "email",
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,63}\b/giu,
    80,
  ),
  regexDetector(
    "us-social-security-number",
    "government-identifier",
    /\b(?!000|666|9\d\d)\d{3}[- ]?(?!00)\d{2}[- ]?(?!0000)\d{4}\b/gu,
    90,
  ),
  regexDetector(
    "payment-card",
    "credit-card",
    /\b(?:\d[ -]*?){13,19}\b/gu,
    85,
    passesLuhn,
  ),
  regexDetector(
    "phone",
    "phone",
    /(?<!\w)(?:\+\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)|\d{2,4})[\s.-]\d{3,4}[\s.-]\d{4}(?!\w)/gu,
    60,
  ),
  regexDetector(
    "north-american-phone",
    "phone",
    /(?<!\w)(?:\+?1)?[2-9]\d{2}[2-9]\d{6}(?!\w)/gu,
    60,
  ),
  regexDetector(
    "ipv4",
    "ip-address",
    /\b(?:\d{1,3}\.){3}\d{1,3}\b/gu,
    50,
    isIpv4,
  ),
  regexDetector(
    "postal-address",
    "postal-address",
    /\b\d{1,6}\s+(?:[A-Z0-9.'-]+\s+){0,6}(?:Avenue|Ave|Boulevard|Blvd|Court|Ct|Drive|Dr|Highway|Hwy|Lane|Ln|Parkway|Pkwy|Place|Pl|Road|Rd|Street|St|Terrace|Ter)\b\.?/giu,
    40,
  ),
  regexDetector(
    "contextual-date-of-birth",
    "date-of-birth",
    /\b(?:date of birth|dob|born on)\s*(?::|is)?\s*(?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|[A-Z][a-z]+ \d{1,2},? \d{4})\b/giu,
    40,
  ),
  regexDetector(
    "contextual-person-name",
    "person-name",
    /\b(?:[Mm]y name is|[Pp]atient(?:'s)? name is|[Cc]lient(?:'s)? name is|[Mm]ember(?:'s)? name is)\s+[\p{Lu}][\p{L}'-]+(?:\s+[\p{Lu}][\p{L}'-]+){0,3}\b/gu,
    30,
  ),
];
