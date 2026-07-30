import { notFound } from "next/navigation";

import { getDb } from "@/db";
import { AuthGuard, requireAuthContext } from "@/lib/auth";
import { loadLiveWorkflowProjection } from "@/lib/openchair/projections/live-workflow";

import { LiveWorkflowUpdates } from "./live-updates";
import { WorkflowView } from "./workflow-view";

type AppointmentPageProps = {
  params: Promise<{ appointmentId: string }>;
};

export default async function AppointmentPage({
  params,
}: AppointmentPageProps) {
  const { appointmentId } = await params;
  return (
    <AuthGuard
      permission="product:use"
      returnTo={`/appointments/${encodeURIComponent(appointmentId)}`}
    >
      <LiveAppointment appointmentId={appointmentId} />
    </AuthGuard>
  );
}

async function LiveAppointment({
  appointmentId,
}: {
  appointmentId: string;
}) {
  const auth = await requireAuthContext();
  const projection = await loadLiveWorkflowProjection(
    getDb(),
    { workspaceId: auth.workspaceId, userId: auth.userId },
    appointmentId,
  );

  if (!projection) notFound();

  return (
    <>
      <LiveWorkflowUpdates
        appointmentId={appointmentId}
        workflowVersion={projection.workflowVersion}
      />
      <WorkflowView projection={projection} />
    </>
  );
}
