import type { Metadata } from "next";
import { PlatformOwnerGuard } from "@/lib/auth";
import { DemoDashboard } from "./demo-dashboard";

export const metadata: Metadata = {
  title: "OpenChair Live Demo",
  description: "One live workflow from open appointment to completed visit.",
};

export default function DemoPage() {
  return (
    <PlatformOwnerGuard returnTo="/demo">
      <DemoDashboard />
    </PlatformOwnerGuard>
  );
}
