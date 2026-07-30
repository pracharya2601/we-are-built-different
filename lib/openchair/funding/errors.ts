export class FundingError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(
    code: string,
    message: string,
    status = 400,
  ) {
    super(message);
    this.name = "FundingError";
    this.code = code;
    this.status = status;
  }
}

export function fundingErrorResponse(error: unknown): Response {
  if (
    error instanceof FundingError ||
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
          message: error instanceof Error ? error.message : "Not allowed.",
        },
      },
      { status: Number(error.status) },
    );
  }
  console.error("Unhandled appointment funding error", error);
  return Response.json(
    {
      error: {
        code: "funding_internal_error",
        message: "Appointment funding is temporarily unavailable.",
      },
    },
    { status: 500 },
  );
}
