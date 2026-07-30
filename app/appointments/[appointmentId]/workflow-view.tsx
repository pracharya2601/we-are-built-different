import type {
  FrontendDataGrant,
  JourneyStage,
  OpenChairAction,
  WorkflowProjection,
} from "@/lib/openchair";

import {
  ApproveCandidatesForm,
  ApproveFundingForm,
  PublishAppointmentForm,
  SponsorCheckoutForm,
} from "./workflow-command-forms";

export function WorkflowView({
  projection,
}: {
  projection: WorkflowProjection;
}) {
  const money = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: projection.appointment.currency,
  });
  const pricing = projection.appointment.pricing;

  return (
    <main className="workflow-shell">
      <header className="workflow-summary">
        <div>
          <p className="kicker">OpenChair appointment</p>
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
          {pricing ? (
            <>
              <div>
                <dt>Care price</dt>
                <dd>{money.format(pricing.discountedPrice / 100)}</dd>
              </div>
              <div>
                <dt>Sponsor</dt>
                <dd>{money.format(pricing.sponsorAmount / 100)}</dd>
              </div>
              <div>
                <dt>Patient</dt>
                <dd>{money.format(pricing.patientAmount / 100)}</dd>
              </div>
            </>
          ) : (
            <div>
              <dt>Financial details</dt>
              <dd>Restricted</dd>
            </div>
          )}
          <div>
            <dt>Duration</dt>
            <dd>{projection.appointment.durationMinutes} min</dd>
          </div>
        </dl>
      </header>

      <section className="workflow-card">
        <div className="workflow-card-heading">
          <div>
            <p className="kicker">Appointment journey</p>
            <h2>{panelHeading(projection.panelType)}</h2>
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
              <p className="kicker">Current step</p>
              <h2>{panelHeading(projection.panelType)}</h2>
            </div>
            <span className="status-pill">Live</span>
          </div>
          <PanelContent projection={projection} money={money} />
        </article>
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
  const commandProps = {
    appointmentId: projection.appointment.appointmentId,
    expectedWorkflowVersion: projection.workflowVersion,
  };

  if (projection.panelType === "OPEN_SLOT") {
    return (
      <>
        <p>
          Review the appointment and publish it to begin patient selection.
        </p>
        {actionAllowed(projection, "appointment.publish") ? (
          <PublishAppointmentForm {...commandProps} />
        ) : (
          <AccessDenied />
        )}
      </>
    );
  }

  if (projection.panelType === "PATIENT_SELECTION") {
    if (
      !dataAllowed(projection, "beneficiary.list") &&
      !dataAllowed(projection, "candidate.order")
    ) {
      return <AccessDenied />;
    }
    const candidateOptions = readCandidateOptions(projection);
    return (
      <>
        <p>
          {data.selectedCandidateCount ?? candidateOptions.length} eligible
          patients are selected for ordered outreach.
        </p>
        {actionAllowed(projection, "candidate.select") ? (
          <ApproveCandidatesForm
            {...commandProps}
            candidateOptions={candidateOptions}
          />
        ) : (
          <AccessDenied actionOnly />
        )}
      </>
    );
  }

  if (projection.panelType === "FUNDING_APPROVAL") {
    const pricing = projection.appointment.pricing;
    if (!dataAllowed(projection, "funding.summary") || !pricing) {
      return <AccessDenied />;
    }
    const sponsorAmount = money.format(pricing.sponsorAmount / 100);
    return (
      <>
        <PaymentSplit projection={projection} money={money} />
        <div className="workflow-action-row">
          {actionAllowed(projection, "funding.approve") &&
          !data.fundingApproved ? (
            <ApproveFundingForm
              {...commandProps}
              amountLabel={sponsorAmount}
            />
          ) : null}
          {actionAllowed(projection, "funding.pay") &&
          data.fundingApproved ? (
            <SponsorCheckoutForm
              {...commandProps}
              amountLabel={sponsorAmount}
            />
          ) : null}
        </div>
        {(!actionAllowed(projection, "funding.approve") &&
          !actionAllowed(projection, "funding.pay")) ? (
          <AccessDenied actionOnly />
        ) : null}
      </>
    );
  }

  if (projection.panelType === "CALLING_PATIENTS") {
    if (!dataAllowed(projection, "outreach.status")) {
      return <AccessDenied />;
    }
    return (
      <>
        <p className="workflow-current-candidate">
          Calling <strong>{data.currentCandidateName ?? "next patient"}</strong>
        </p>
        <OutcomeList outcomes={data.previousOutcomes} />
      </>
    );
  }

  if (projection.panelType === "PATIENT_ACCEPTED") {
    if (!dataAllowed(projection, "accepted-patient.identity")) {
      return <AccessDenied />;
    }
    return (
      <p>
        <strong>{data.acceptedPatientName ?? "A patient"}</strong> accepted.
        Their reservation is confirmed and payment is the next step.
      </p>
    );
  }

  if (projection.panelType === "PAYMENT") {
    if (!dataAllowed(projection, "payment.status")) {
      return <AccessDenied />;
    }
    return (
      <>
        <PaymentSplit projection={projection} money={money} />
        <p className="workflow-note">
          Payment status updates after provider confirmation.
        </p>
      </>
    );
  }

  if (projection.panelType === "CHAIR_FILLED") {
    const canSeeIdentity = dataAllowed(
      projection,
      "accepted-patient.identity",
    );
    const canSeePayments = dataAllowed(projection, "payment.status");
    if (!canSeeIdentity && !canSeePayments) return <AccessDenied />;
    const totalCollected =
      projection.appointment.pricing?.discountedPrice ??
      (data.payments
        ? data.payments.sponsor.amount + data.payments.patient.amount
        : 0);
    return (
      <>
        <p className="workflow-filled-title">OpenChair filled</p>
        <p>
          {canSeeIdentity
            ? `${data.acceptedPatientName ?? "The accepted patient"} is confirmed.`
            : "An approved patient is confirmed; identity is restricted."}{" "}
          {canSeePayments && totalCollected > 0
            ? `Contributions totaling ${money.format(totalCollected / 100)} were collected.`
            : null}
        </p>
        {canSeePayments ? (
          <PaymentSplit projection={projection} money={money} />
        ) : null}
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
        Contact an operator if this appointment needs review.
      </p>
    </>
  );
}

function readCandidateOptions(projection: WorkflowProjection) {
  return projection.panelData.candidateOptions ?? [];
}

function AccessDenied({ actionOnly = false }: { actionOnly?: boolean }) {
  return (
    <p className="workflow-access-denied">
      {actionOnly
        ? "You do not have an available action for this step."
        : "This information is not included in your appointment view."}
    </p>
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

function actionAllowed(
  projection: WorkflowProjection,
  action: OpenChairAction,
): boolean {
  return projection.access.actions[action].allowed;
}

function dataAllowed(
  projection: WorkflowProjection,
  grant: FrontendDataGrant,
): boolean {
  return projection.access.data[grant].allowed;
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
