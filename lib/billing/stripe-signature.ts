import { BillingError } from "./errors";

const SIGNATURE_VERSION = "v1";

export async function verifyStripeWebhookSignature(input: {
  payload: string;
  signatureHeader: string;
  secret: string;
  toleranceSeconds?: number;
  now?: Date;
}): Promise<void> {
  const parsed = parseSignatureHeader(input.signatureHeader);
  if (parsed.timestamp === null || parsed.signatures.length === 0) {
    throw new BillingError(
      "Stripe signature header is malformed.",
      "invalid_webhook_signature",
      400,
    );
  }

  const nowSeconds = Math.floor((input.now ?? new Date()).getTime() / 1000);
  const tolerance = input.toleranceSeconds ?? 300;
  if (Math.abs(nowSeconds - parsed.timestamp) > tolerance) {
    throw new BillingError(
      "Stripe webhook timestamp is outside the allowed tolerance.",
      "stale_webhook_signature",
      400,
    );
  }

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(input.secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`${parsed.timestamp}.${input.payload}`),
  );
  const expected = bytesToHex(new Uint8Array(digest));

  if (!parsed.signatures.some((signature) => constantTimeHexEqual(expected, signature))) {
    throw new BillingError(
      "Stripe webhook signature is invalid.",
      "invalid_webhook_signature",
      400,
    );
  }
}

function parseSignatureHeader(value: string): {
  timestamp: number | null;
  signatures: string[];
} {
  let timestamp: number | null = null;
  const signatures: string[] = [];

  for (const entry of value.split(",")) {
    const separator = entry.indexOf("=");
    if (separator < 1) continue;
    const key = entry.slice(0, separator).trim();
    const itemValue = entry.slice(separator + 1).trim();
    if (key === "t" && /^\d+$/.test(itemValue)) {
      timestamp = Number.parseInt(itemValue, 10);
    } else if (key === SIGNATURE_VERSION && /^[a-fA-F0-9]{64}$/.test(itemValue)) {
      signatures.push(itemValue.toLowerCase());
    }
  }
  return { timestamp, signatures };
}

function bytesToHex(bytes: Uint8Array): string {
  let result = "";
  for (const byte of bytes) result += byte.toString(16).padStart(2, "0");
  return result;
}

function constantTimeHexEqual(left: string, right: string): boolean {
  const length = Math.max(left.length, right.length);
  let mismatch = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    mismatch |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return mismatch === 0;
}
