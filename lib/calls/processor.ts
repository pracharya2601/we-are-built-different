import type { AppDatabase } from "../../db";
import {
  getCallDataEncryptionKey,
  getVapiCallConfiguration,
} from "./config";
import { revealCallRecipient } from "./protection";
import {
  claimQueuedCallAttempt,
  markCallAccepted,
  markCallDispatchFailure,
} from "./store";
import type { CallQueueMessage } from "./types";
import { createVapiCall, VapiRequestError } from "./vapi";

type ProcessorEnvironment = Parameters<
  typeof getVapiCallConfiguration
>[0] &
  Parameters<typeof getCallDataEncryptionKey>[0];

export async function processCallQueueMessage(
  db: AppDatabase,
  environment: ProcessorEnvironment,
  message: CallQueueMessage,
): Promise<"processed" | "duplicate"> {
  if (
    message.version !== 1 ||
    !/^clj_[a-f0-9]{32}$/u.test(message.jobId) ||
    !/^cla_[a-f0-9]{32}$/u.test(message.attemptId)
  ) {
    throw new Error("Unsupported call queue message.");
  }

  const encryptionKey = getCallDataEncryptionKey(environment);
  const configuration = getVapiCallConfiguration(environment);
  const claimed = await claimQueuedCallAttempt(db, message);
  if (!claimed) return "duplicate";

  try {
    const recipient = await revealCallRecipient(
      claimed.job.recipientDataCiphertext,
      encryptionKey,
    );
    const call = await createVapiCall(configuration, {
      attemptId: claimed.attempt.id,
      jobId: claimed.job.id,
      recipient,
    });
    await markCallAccepted(db, {
      attemptId: claimed.attempt.id,
      jobId: claimed.job.id,
      providerCallId: call.id,
    });
  } catch (error) {
    const providerError =
      error instanceof VapiRequestError
        ? error
        : new VapiRequestError(
            "call_dispatch_failed",
            error instanceof Error
              ? error.message
              : "Call dispatch failed.",
            { retryable: false, ambiguous: true },
          );
    await markCallDispatchFailure(db, {
      attemptId: claimed.attempt.id,
      jobId: claimed.job.id,
      code: providerError.code,
      message: providerError.message,
      retryable: providerError.retryable,
      ambiguous: providerError.ambiguous,
      retryAt: new Date(Date.now() + 5 * 60_000),
    });
  }
  return "processed";
}
