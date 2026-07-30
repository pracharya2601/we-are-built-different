import { getDb } from "@/db";
import { withApiAuth } from "@/lib/auth";
import { appendAuditLog } from "@/lib/data";
import {
  FinanceValidationError,
  createFundingPool,
  listFundingPools,
} from "@/lib/finance";

export const GET = withApiAuth(
  async function getFundingPools(_request, _context, auth) {
    return Response.json(
      {
        workspaceId: auth.workspaceId,
        pools: await listFundingPools(getDb(), auth.workspaceId),
      },
      { headers: { "cache-control": "private, no-store" } },
    );
  },
  "funds:view",
);

export const POST = withApiAuth(
  async function createPool(request, _context, auth) {
    const body = await readBody(request);
    const name = typeof body?.name === "string" ? body.name : "";
    const currency = typeof body?.currency === "string" ? body.currency : "";
    try {
      const db = getDb();
      const pool = await createFundingPool(db, {
        workspaceId: auth.workspaceId,
        name,
        currency,
        createdByUserId: auth.userId,
      });
      await appendAuditLog(db, {
        workspaceId: auth.workspaceId,
        actorType: "user",
        actorId: auth.userId,
        action: "finance.funding_pool.created",
        targetType: "funding_pool",
        targetId: pool.id,
        metadata: { currency: pool.currency },
      });
      return Response.json(
        { pool },
        { status: 201, headers: { "cache-control": "no-store" } },
      );
    } catch (caught) {
      if (caught instanceof FinanceValidationError) {
        return error(caught.code, caught.message, 400);
      }
      if (caught instanceof Error && caught.message.includes("Funding pool names")) {
        return error("invalid_pool_name", caught.message, 400);
      }
      throw caught;
    }
  },
  "funds:manage",
);

async function readBody(
  request: Request,
): Promise<Record<string, unknown> | null> {
  try {
    const value: unknown = await request.json();
    return value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function error(code: string, message: string, status: number): Response {
  return Response.json(
    { error: { code, message } },
    { status, headers: { "cache-control": "no-store" } },
  );
}
