import Link from "next/link";
import type {
  JourneyStage,
  ViewerRole,
  WorkflowProjection,
} from "@/lib/openchair";
import { WORKFLOW_FIXTURE_NAMES } from "@/lib/openchair/fixtures";

const ROLE_LABELS: Record<ViewerRole, string> = {
  clinic: "Clinic",
  nonprofit: "Nonprofit",
  sponsor: "Sponsor",
  operator: "Operator",
};

export function WorkflowPreview({
  projection,
}: {
  projection: WorkflowProjection;
}) {
  const money = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: projection.appointment.currency,
  });

  return (
    <main className="workflow-shell">
      <section className="workflow-preview-banner" aria-label="Preview notice">
        <div>
          <strong>OpenChair scaffold preview</strong>
          <span>
            Synthetic fixture data · actions do not contact Stripe or Vapi
          </span>
        </div>
        <Link href="/">Back to home</Link>
      </section>

      <header className="workflow-summary">
        <div>
          <p className="kicker">Canceled-chair recovery</p>
          <h1>{projection.appointment.treatmentType}</h1>
          <p>
            {projection.appointment.clinicName} ·{" "}
            {new Date(projection.appointment.startsAt).toLocaleString("en-US", {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </p>
        </div>
        <dl>
          <div>
            <dt>Care price</dt>
            <dd>{money.format(projection.appointment.discountedPrice / 100)}</dd>
          </div>
          <div>
            <dt>Sponsor</dt>
            <dd>{money.format(projection.appointment.sponsorAmount / 100)}</dd>
          </div>
          <div>
            <dt>Patient</dt>
            <dd>{money.format(projection.appointment.patientAmount / 100)}</dd>
          </div>
          <div>
            <dt>Duration</dt>
            <dd>{projection.appointment.durationMinutes} min</dd>
          </div>
        </dl>
      </header>

      <nav className="workflow-fixture-nav" aria-label="Workflow fixtures">
        {WORKFLOW_FIXTURE_NAMES.map((name) => (
          <Link
            className={projection.fixture?.name === name ? "is-current" : ""}
            href={`/appointments/demo-openchair?fixture=${name}&role=${projection.viewerRole}`}
            key={name}
          >
            {name.replaceAll("-", " ")}
          </Link>
        ))}
      </nav>

      <section className="workflow-card">
        <div className="workflow-card-heading">
          <div>
            <p className="kicker">Appointment journey</p>
            <h2>{projection.fixture?.description}</h2>
          </div>
          <span className="workflow-version">
            Workflow v{projection.workflowVersion}
          </span>
        </div>

        <ol className="workflow-journey">
          {projection.stages.map((item, index) => (
            <li className={`stage-${item.status}`} key={item.stage}>
              <span className="stage-marker" aria-hidden="true">
                {item.status === "completed" ? "✓" : index + 1}
              </span>
              <span>
                <strong>{item.label}</strong>
                <small>{item.status}</small>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section className="workflow-context-grid">
        <article className="workflow-card workflow-panel">
          <div className="workflow-card-heading">
            <div>
              <p className="kicker">Contextual panel</p>
              <h2>{panelHeading(projection.panelType)}</h2>
            </div>
            <span className="status-pill">
              {ROLE_LABELS[projection.viewerRole]} view
            </span>
          </div>
          <PanelContent projection={projection} money={money} />
        </article>

        <aside className="workflow-card workflow-inspector">
          <p className="kicker">Scaffold contract</p>
          <h2>Server-authorized actions</h2>
          {projection.allowedActions.length > 0 ? (
            <ul>
              {projection.allowedActions.map((action) => (
                <li key={action}>
                  <code>{action}</code>
                </li>
              ))}
            </ul>
          ) : (
            <p>No actions are available in this projection.</p>
          )}
          <p className="workflow-note">
            The browser can request an action, but only the backend workflow
            command handler may advance the stage.
          </p>
        </aside>
      </section>

      <section className="workflow-role-switcher" aria-label="Preview roles">
        <span>Preview projection:</span>
        {(["clinic", "nonprofit", "sponsor", "operator"] as const).map(
          (role) => (
            <Link
              className={role === projection.viewerRole ? "is-current" : ""}
              href={`/appointments/demo-openchair?fixture=${projection.fixture?.name ?? "open-slot"}&role=${role}`}
              key={role}
            >
              {ROLE_LABELS[role]}
            </Link>
          ),
        )}
      </section>
    </main>
  );
}

function PanelContent({
  projection,
  money,
}: {
  projection: WorkflowProjection;
  money: Intl.NumberFormat;
}) {
  const data = projection.panelData;
  if (projection.panelType === "OPEN_SLOT") {
    return (
      <>
        <p>
          Review the appointment and publish it to begin nonprofit patient
          selection.
        </p>
        <DisabledAction label="Publish OpenChair Slot" />
      </>
    );
  }
  if (projection.panelType === "PATIENT_SELECTION") {
    return (
      <>
        <p>
          {data.selectedCandidateCount ?? 0} eligible patients are selected for
          ordered outreach.
        </p>
        <DisabledAction label="Approve Patient Outreach" />
      </>
    );
  }
  if (projection.panelType === "FUNDING_APPROVAL") {
    return (
      <>
        <PaymentSplit projection={projection} money={money} />
        <DisabledAction
          label={`Approve and Fund ${money.format(
            projection.appointment.sponsorAmount / 100,
          )}`}
        />
      </>
    );
  }
  if (projection.panelType === "CALLING_PATIENTS") {
    return (
      <>
        <p className="workflow-current-candidate">
          Calling <strong>{data.currentCandidateName ?? "next patient"}</strong>
        </p>
        <OutcomeList outcomes={data.previousOutcomes} />
        <div className="workflow-action-row">
          <DisabledAction label="Take over" />
          <DisabledAction label="Skip" />
          <DisabledAction label="Stop calling" />
        </div>
      </>
    );
  }
  if (projection.panelType === "PATIENT_ACCEPTED") {
    return (
      <>
        <p>
          <strong>{data.acceptedPatientName ?? "A patient"}</strong> accepted.
          Workflow reservation must be confirmed before a payment link is sent.
        </p>
        <DisabledAction label="Send Payment Link" />
      </>
    );
  }
  if (projection.panelType === "PAYMENT") {
    return (
      <>
        <PaymentSplit projection={projection} money={money} />
        <p className="workflow-note">
          Status changes only after a verified Stripe webhook.
        </p>
      </>
    );
  }
  if (projection.panelType === "CHAIR_FILLED") {
    return (
      <>
        <p className="workflow-filled-title">OpenChair Filled</p>
        <p>
          {data.acceptedPatientName ?? "The accepted patient"} is confirmed.
          Contributions totaling{" "}
          {money.format(projection.appointment.discountedPrice / 100)} were
          collected.
        </p>
        <OutcomeList outcomes={data.previousOutcomes} />
      </>
    );
  }
  return (
    <>
      <p className="workflow-terminal-message">
        {data.blockedReason ?? "The workflow cannot continue."}
      </p>
      <p className="workflow-note">
        Terminal recovery requires an audited backend decision.
      </p>
    </>
  );
}

function PaymentSplit({
  projection,
  money,
}: {
  projection: WorkflowProjection;
  money: Intl.NumberFormat;
}) {
  const payments = projection.panelData.payments;
  if (!payments) return null;
  return (
    <dl className="workflow-payment-split">
      <div>
        <dt>Sponsor contribution</dt>
        <dd>
          {money.format(payments.sponsor.amount / 100)} ·{" "}
          <strong>{payments.sponsor.status}</strong>
        </dd>
      </div>
      <div>
        <dt>Patient contribution</dt>
        <dd>
          {money.format(payments.patient.amount / 100)} ·{" "}
          <strong>{payments.patient.status}</strong>
        </dd>
      </div>
    </dl>
  );
}

function OutcomeList({
  outcomes,
}: {
  outcomes: WorkflowProjection["panelData"]["previousOutcomes"];
}) {
  if (!outcomes?.length) return null;
  return (
    <ul className="workflow-outcomes">
      {outcomes.map((outcome) => (
        <li key={`${outcome.displayName}-${outcome.outcome}`}>
          <span>{outcome.displayName}</span>
          <strong>{outcome.outcome}</strong>
        </li>
      ))}
    </ul>
  );
}

function DisabledAction({ label }: { label: string }) {
  return (
    <button className="button" disabled type="button">
      {label} · handler next
    </button>
  );
}

function panelHeading(panelType: JourneyStage | "TERMINAL"): string {
  return panelType === "TERMINAL"
    ? "Workflow stopped"
    : panelType
        .toLowerCase()
        .split("_")
        .map((part) => part[0]?.toUpperCase() + part.slice(1))
        .join(" ");
}
