import type { AppDatabase } from "../../../db/index.ts";
import {
  createCallJob,
  enqueueCallAttempt,
  protectCallRecipient,
  type CallQueue,
  type CallRecipientData,
} from "../../calls/index.ts";
import type { AppointmentId } from "../contracts/index.ts";
import type {
  OpenChairCallDispatcher,
  OutreachCandidate,
  OutreachDispatch,
} from "./service.ts";

export type OpenChairCallPacket = {
  workspaceId: string;
  recipient: CallRecipientData;
};

export function createEncryptedCallDispatcher(input: {
  db: AppDatabase;
  queue: CallQueue;
  encryptionKey: string;
  createdByUserId: string;
  resolveCallPacket(
    appointmentId: AppointmentId,
    candidate: OutreachCandidate,
  ): Promise<OpenChairCallPacket>;
}): OpenChairCallDispatcher {
  return {
    async dispatch(
      appointmentId: AppointmentId,
      candidate: OutreachCandidate,
    ): Promise<OutreachDispatch> {
      const packet = await input.resolveCallPacket(
        appointmentId,
        candidate,
      );
      const recipientDataCiphertext = await protectCallRecipient(
        packet.recipient,
        input.encryptionKey,
      );
      const created = await createCallJob(input.db, {
        workspaceId: packet.workspaceId,
        createdByUserId: input.createdByUserId,
        recipientDataCiphertext,
        recipientPhoneLast4: packet.recipient.phoneNumber.slice(-4),
        // One provider attempt keeps candidate sequencing deterministic.
        // Operator recovery creates a new job after reviewing ambiguity.
        maxAttempts: 1,
      });
      const queued = await enqueueCallAttempt(input.db, input.queue, {
        version: 1,
        jobId: created.job.id,
        attemptId: created.attempt.id,
      });
      if (!queued) {
        throw new Error("The encrypted call attempt was not queued.");
      }
      return {
        callJobId: created.job.id,
        callAttemptId: created.attempt.id,
      };
    },
  };
}
