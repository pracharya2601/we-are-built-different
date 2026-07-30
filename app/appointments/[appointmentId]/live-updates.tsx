"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

export function LiveWorkflowUpdates({
  appointmentId,
  workflowVersion,
}: {
  appointmentId: string;
  workflowVersion: number;
}) {
  const router = useRouter();
  const latestVersion = useRef(workflowVersion);

  useEffect(() => {
    latestVersion.current = workflowVersion;
  }, [workflowVersion]);

  useEffect(() => {
    const events = new EventSource(
      `/api/v1/openchair/appointments/${encodeURIComponent(appointmentId)}/events`,
    );

    const refreshForNewVersion = (event: MessageEvent<string>) => {
      const version = readWorkflowVersion(event.data);
      if (version === null || version <= latestVersion.current) return;
      latestVersion.current = version;
      router.refresh();
    };

    events.addEventListener("workflow-version", refreshForNewVersion);
    return () => {
      events.removeEventListener("workflow-version", refreshForNewVersion);
      events.close();
    };
  }, [appointmentId, router]);

  return null;
}

function readWorkflowVersion(data: string): number | null {
  try {
    const value = JSON.parse(data) as { version?: unknown };
    return typeof value.version === "number" &&
      Number.isSafeInteger(value.version) &&
      value.version > 0
      ? value.version
      : null;
  } catch {
    return null;
  }
}
