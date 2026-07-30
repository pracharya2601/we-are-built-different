export class OpenChairCommandError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "OpenChairCommandError";
    this.code = code;
    this.status = status;
  }
}

export function commandErrorResponse(error: unknown): Response {
  if (
    error instanceof OpenChairCommandError ||
    (error &&
      typeof error === "object" &&
      "status" in error &&
      typeof error.status === "number" &&
      error.status >= 400 &&
      error.status <= 599 &&
      "code" in error)
  ) {
    return Response.json(
      {
        error: {
          code: String(error.code),
          message: error instanceof Error ? error.message : "Command rejected.",
        },
      },
      {
        status: Number(error.status),
        headers: { "cache-control": "no-store" },
      },
    );
  }
  console.error("Unhandled OpenChair command error", error);
  return Response.json(
    {
      error: {
        code: "openchair_command_internal_error",
        message: "The appointment command could not be completed.",
      },
    },
    {
      status: 500,
      headers: { "cache-control": "no-store" },
    },
  );
}
