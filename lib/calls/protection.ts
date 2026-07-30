import { openJson, sealJson } from "../auth/crypto.ts";
import type { CallRecipientData, CallResultData } from "./types.ts";

const RECIPIENT_PURPOSE = "call-job-recipient:v1";
const RESULT_PURPOSE = "call-attempt-result:v1";

export function protectCallRecipient(
  recipient: CallRecipientData,
  key: string,
): Promise<string> {
  return sealJson(recipient, key, RECIPIENT_PURPOSE);
}

export async function revealCallRecipient(
  ciphertext: string,
  key: string,
): Promise<CallRecipientData> {
  const value = await openJson<CallRecipientData>(
    ciphertext,
    key,
    RECIPIENT_PURPOSE,
  );
  if (!value) {
    throw new Error("Stored call recipient data could not be decrypted.");
  }
  return value;
}

export function protectCallResult(
  result: CallResultData,
  key: string,
): Promise<string> {
  return sealJson(result, key, RESULT_PURPOSE);
}

export async function revealCallResult(
  ciphertext: string | null,
  key: string,
): Promise<CallResultData | null> {
  if (!ciphertext) return null;
  const value = await openJson<CallResultData>(
    ciphertext,
    key,
    RESULT_PURPOSE,
  );
  if (!value) {
    throw new Error("Stored call result data could not be decrypted.");
  }
  return value;
}
