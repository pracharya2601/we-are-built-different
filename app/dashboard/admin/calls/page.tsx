import {
  CallConfigurationError,
  getCallDataEncryptionKey,
  getCallRuntimeEnvironment,
  listCallLogs,
  revealCallRecipient,
  revealCallResult,
} from "@/lib/calls";
import { PlatformOwnerGuard } from "@/lib/auth";
import { getDb } from "@/db";
import { CallConsole } from "./call-console";
import { LiveCallBoard } from "./live-call-board";

export default function CallsPage() {
  return (
    <PlatformOwnerGuard>
      <CallsPageContent />
    </PlatformOwnerGuard>
  );
}

async function CallsPageContent() {
  let calls: Parameters<typeof CallConsole>[0]["calls"] | null = null;
  let configurationMessage: string | null = null;
  try {
    const encryptionKey = getCallDataEncryptionKey(
      getCallRuntimeEnvironment(),
    );
    const logs = await listCallLogs(getDb());
    calls = await Promise.all(
      logs.map(async ({ job, attempts }) => {
        const recipient = await revealCallRecipient(
          job.recipientDataCiphertext,
          encryptionKey,
        );
        return {
          id: job.id,
          recipientName: recipient.name,
          maskedPhoneNumber: maskPhoneNumber(
            recipient.phoneNumber,
            job.recipientPhoneLast4,
          ),
          status: job.status,
          outcome: job.outcome,
          attemptCount: job.attemptCount,
          maxAttempts: job.maxAttempts,
          nextAttemptAt: job.nextAttemptAt?.toISOString() ?? null,
          createdAt: job.createdAt.toISOString(),
          attempts: await Promise.all(
            attempts.map(async (attempt) => {
              const result = await revealCallResult(
                attempt.resultCiphertext,
                encryptionKey,
              );
              return {
                id: attempt.id,
                number: attempt.attemptNumber,
                status: attempt.status,
                outcome: attempt.outcome,
                summary: result?.summary ?? null,
                selectedAvailability:
                  result?.selectedAvailability ?? null,
                failureMessage: attempt.failureMessage,
                scheduledAt: attempt.scheduledAt.toISOString(),
                endedAt: attempt.endedAt?.toISOString() ?? null,
              };
            }),
          ),
        };
      }),
    );

  } catch (error) {
    if (error instanceof CallConfigurationError) {
      configurationMessage = error.message;
    } else {
      throw error;
    }
  }

  if (configurationMessage) {
    return (
      <section className="content-card auth-state-card">
        <p className="kicker">Configuration required</p>
        <h1>Call automation is fail-closed.</h1>
        <p>{configurationMessage}</p>
        <p>
          Add the local-only values documented in <code>.env.example</code>,
          then restart the development server.
        </p>
      </section>
    );
  }
  if (!calls) {
    throw new Error("Call logs were not loaded.");
  }

  return (
    <>
      <header className="app-header">
        <div className="workspace-identity">
          <span className="workspace-avatar">AI</span>
          <div>
            <strong>Call automation</strong>
            <span>Platform-owner console · Vapi + Cloudflare Queues</span>
          </div>
        </div>
        <a className="button button-quiet" href="/api/auth/logout">
          Sign out
        </a>
      </header>

      <section className="page-heading call-heading">
        <p className="kicker">Voice operations</p>
        <h1>Calls run off the request path.</h1>
        <p>
          Queue approved recipient context, track retries, and review
          structured Vapi outcomes without exposing these logs to workspace
          members.
        </p>
      </section>

      <LiveCallBoard />
      <CallConsole calls={calls} />
    </>
  );
}

function maskPhoneNumber(value: string, last4: string): string {
  return `${value.startsWith("+") ? "+" : ""}${"•".repeat(
    Math.max(4, value.replace(/\D/gu, "").length - 4),
  )}${last4}`;
}
