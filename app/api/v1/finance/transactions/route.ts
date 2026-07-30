import { getDb } from "@/db";
import { withApiAuth } from "@/lib/auth";
import { listFinancialTransactions } from "@/lib/finance";

export const GET = withApiAuth(
  async function getFinancialTransactions(request, _context, auth) {
    const poolId = new URL(request.url).searchParams.get("poolId") ?? undefined;
    if (poolId && !/^pool_[a-f0-9]{32}$/u.test(poolId)) {
      return Response.json(
        {
          error: {
            code: "invalid_pool",
            message: "A valid funding pool ID is required.",
          },
        },
        { status: 400, headers: { "cache-control": "no-store" } },
      );
    }
    return Response.json(
      {
        workspaceId: auth.workspaceId,
        transactions: await listFinancialTransactions(
          getDb(),
          auth.workspaceId,
          poolId,
        ),
      },
      { headers: { "cache-control": "private, no-store" } },
    );
  },
  "funds:view",
);
