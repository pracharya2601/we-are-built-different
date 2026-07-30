import { getDb } from "@/db";
import { withPlatformOwner } from "@/lib/auth";
import { CallConfigurationError } from "@/lib/calls";
import { appendAuditLog } from "@/lib/data";
import {
  DemoCallError,
  getDemoCallView,
  queueDemoPatientCall,
} from "@/lib/demo/calls";

export const runtime = "edge";

export const GET = withPlatformOwner(
  async function getCurrentDemoCall(_request, _context, auth) {
    try {
      const call = await getDemoCallView(getDb(), auth.workspaceId);
      return Response.json(
        { call },
        { headers: { "cache-control": "private, no-store" } },
      );
    } catch (error) {
      if (error instanceof CallConfigurationError) {
        return apiError("call_automation_not_configured", error.message, 503);
      }
      throw error;
    }
  },
);

export const POST = withPlatformOwner(
  async function startDemoCall(request, _context, auth) {
    try {
      assertSameOrigin(request);
      const body = await readJson(request);
      const db = getDb();
      const call = await queueDemoPatientCall(db, {
        workspaceId: auth.workspaceId,
        userId: auth.userId,
        patientId: isRecord(body) ? body.patientId : undefined,
      });
      await appendAuditLog(db, {
        workspaceId: auth.workspaceId,
        actorType: "user",
        actorId: auth.userId,
        action: "demo.call.started",
        targetType: "call_job",
        targetId: call.jobId!,
        requestId: request.headers.get("cf-ray"),
        metadata: {
          patientId: call.patientId,
          attemptId: call.attemptId,
        },
      });
      return Response.json(
        { call },
        {
          status: 202,
          headers: { "cache-control": "private, no-store" },
        },
      );
    } catch (error) {
      if (error instanceof DemoCallError) {
        return apiError(error.code, error.message, error.status);
      }
      if (error instanceof CallConfigurationError) {
        return apiError("call_automation_not_configured", error.message, 503);
      }
      if (error instanceof RequestSecurityError) {
        return apiError(error.code, error.message, 403);
      }
      throw error;
    }
  },
);

async function readJson(request: Request): Promise<unknown> {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 2_000) {
    throw new DemoCallError(
      "request_too_large",
      "Demo call request must not exceed 2 KB.",
      400,
    );
  }
  try {
    const text = await request.text();
    if (text.length > 2_000) {
      throw new DemoCallError(
        "request_too_large",
        "Demo call request must not exceed 2 KB.",
        400,
      );
    }
    return JSON.parse(text);
  } catch (error) {
    if (error instanceof DemoCallError) throw error;
    throw new DemoCallError(
      "invalid_json",
      "Request body must contain valid JSON.",
      400,
    );
  }
}

function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) {
    throw new RequestSecurityError(
      "invalid_origin",
      "Demo call creation requires a same-origin browser request.",
    );
  }
}

class RequestSecurityError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "RequestSecurityError";
  }
}

function apiError(code: string, message: string, status: number): Response {
  return Response.json(
    { error: { code, message } },
    { status, headers: { "cache-control": "no-store" } },
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
