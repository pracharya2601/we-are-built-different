import { getDb } from "@/db";
import { withPlatformOwner } from "@/lib/auth";
import { readDemoWorkflowSnapshot } from "@/lib/demo";

export const GET = withPlatformOwner(
  async function getDemoWorkflow(_request, _context, auth) {
    return Response.json(
      await readDemoWorkflowSnapshot(getDb(), {
        workspaceId: auth.workspaceId,
        userId: auth.userId,
      }),
      { headers: { "cache-control": "private, no-store" } },
    );
  },
);
