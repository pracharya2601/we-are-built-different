import { notFound } from "next/navigation";
import { AuthGuard } from "@/lib/auth";
import {
  buildWorkflowFixture,
  isViewerRole,
  isWorkflowFixtureName,
} from "@/lib/openchair/fixtures";
import { WorkflowPreview } from "./workflow-preview";

type AppointmentPageProps = {
  params: Promise<{ appointmentId: string }>;
  searchParams: Promise<{
    fixture?: string | string[];
    role?: string | string[];
  }>;
};

export default async function AppointmentPage({
  params,
  searchParams,
}: AppointmentPageProps) {
  const { appointmentId } = await params;
  if (appointmentId !== "demo-openchair") notFound();

  const query = await searchParams;
  const requestedFixture = first(query.fixture);
  const requestedRole = first(query.role);
  const fixture =
    requestedFixture && isWorkflowFixtureName(requestedFixture)
      ? requestedFixture
      : "open-slot";
  const viewerRole =
    requestedRole && isViewerRole(requestedRole) ? requestedRole : "operator";
  const projection = buildWorkflowFixture(fixture, viewerRole);

  return (
    <AuthGuard
      returnTo={`/appointments/demo-openchair?fixture=${fixture}&role=${viewerRole}`}
    >
      <WorkflowPreview projection={projection} />
    </AuthGuard>
  );
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
