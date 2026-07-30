"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

type CommandFormProps = {
  appointmentId: string;
  expectedWorkflowVersion: number;
};

type CandidateOption = {
  candidateId: string;
  displayName: string;
};

type CommandState = {
  pending: boolean;
  message: string | null;
};

const INITIAL_STATE: CommandState = { pending: false, message: null };

export function PublishAppointmentForm(props: CommandFormProps) {
  return (
    <WorkflowCommandForm
      {...props}
      endpoint="publish"
      label="Publish OpenChair slot"
    />
  );
}

export function ApproveCandidatesForm({
  candidateOptions,
  ...props
}: CommandFormProps & { candidateOptions: CandidateOption[] }) {
  const router = useRouter();
  const [state, setState] = useState(INITIAL_STATE);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (candidateOptions.length === 0) return;
    setState({ pending: true, message: null });
    const result = await postCommand(
      `/api/v1/openchair/appointments/${encodeURIComponent(props.appointmentId)}/candidates/approve`,
      props.expectedWorkflowVersion,
      {
        candidateIds: candidateOptions.map(
          (candidate) => candidate.candidateId,
        ),
      },
    );
    finishCommand(result, router.refresh, setState);
  }

  if (candidateOptions.length === 0) {
    return (
      <p className="workflow-note">
        No eligible candidates are available to approve.
      </p>
    );
  }

  return (
    <form className="workflow-command-form" onSubmit={submit}>
      <fieldset disabled={state.pending}>
        <legend>Patients for ordered outreach</legend>
        <ol>
          {candidateOptions.map((candidate) => (
            <li key={candidate.candidateId}>{candidate.displayName}</li>
          ))}
        </ol>
      </fieldset>
      <button
        className="button"
        disabled={state.pending}
        type="submit"
      >
        {state.pending ? "Approving…" : "Approve patient outreach"}
      </button>
      <CommandMessage message={state.message} />
    </form>
  );
}

export function ApproveFundingForm({
  amountLabel,
  ...props
}: CommandFormProps & { amountLabel: string }) {
  return (
    <WorkflowCommandForm
      {...props}
      endpoint="funding/approve"
      label={`Approve funding for ${amountLabel}`}
    />
  );
}

export function SponsorCheckoutForm({
  amountLabel,
  ...props
}: CommandFormProps & { amountLabel: string }) {
  return (
    <WorkflowCommandForm
      {...props}
      endpoint="funding/sponsor/checkout"
      label={`Continue to sponsor checkout (${amountLabel})`}
      redirectToCheckout
    />
  );
}

function WorkflowCommandForm({
  appointmentId,
  endpoint,
  expectedWorkflowVersion,
  label,
  redirectToCheckout = false,
}: CommandFormProps & {
  endpoint: string;
  label: string;
  redirectToCheckout?: boolean;
}) {
  const router = useRouter();
  const [state, setState] = useState(INITIAL_STATE);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState({ pending: true, message: null });
    const result = await postCommand(
      `/api/v1/openchair/appointments/${encodeURIComponent(appointmentId)}/${endpoint}`,
      expectedWorkflowVersion,
    );

    if (result.ok && redirectToCheckout && result.checkoutUrl) {
      window.location.assign(result.checkoutUrl);
      return;
    }
    finishCommand(result, router.refresh, setState);
  }

  return (
    <form className="workflow-command-form" onSubmit={submit}>
      <button className="button" disabled={state.pending} type="submit">
        {state.pending ? "Working…" : label}
      </button>
      <CommandMessage message={state.message} />
    </form>
  );
}

async function postCommand(
  url: string,
  expectedWorkflowVersion: number,
  values: Record<string, unknown> = {},
): Promise<{
  ok: boolean;
  conflict: boolean;
  checkoutUrl: string | null;
  message: string | null;
}> {
  const idempotencyKey = `openchair_${crypto.randomUUID()}`;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": idempotencyKey,
      },
      body: JSON.stringify({
        ...values,
        expectedWorkflowVersion,
        idempotencyKey,
      }),
    });
    const payload = (await response.json().catch(() => null)) as {
      url?: unknown;
      error?: { message?: unknown };
    } | null;
    return {
      ok: response.ok,
      conflict: response.status === 409,
      checkoutUrl:
        typeof payload?.url === "string" ? payload.url : null,
      message:
        typeof payload?.error?.message === "string"
          ? payload.error.message
          : response.ok
            ? null
            : "The command could not be completed.",
    };
  } catch {
    return {
      ok: false,
      conflict: false,
      checkoutUrl: null,
      message: "The command could not be completed. Try again.",
    };
  }
}

function finishCommand(
  result: Awaited<ReturnType<typeof postCommand>>,
  refresh: () => void,
  setState: (state: CommandState) => void,
) {
  if (result.ok || result.conflict) refresh();
  setState({
    pending: false,
    message: result.conflict
      ? "The appointment changed. The latest state is loading."
      : result.message,
  });
}

function CommandMessage({ message }: { message: string | null }) {
  return message ? (
    <p className="workflow-command-message" role="status">
      {message}
    </p>
  ) : null;
}
